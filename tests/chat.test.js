const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { chatReply } = require('../ai');

test('chat provider receives bounded server-owned turns and fresh context', async () => {
  const turns = Array.from({length:30}, (_,i) => ({role:i%2?'assistant':'user', content:`turn-${i}`,date:'2026-10-08',requestId:'private-id'}));
  const result = await chatReply({meals:[],preferences:{allergies:'peanuts'}}, turns, {apiKey:'test',fetchImpl:async(_url,request)=>{
    const sent=JSON.parse(request.body);
    assert.equal(sent.messages.length,15); assert.equal(sent.messages[0].role,'system');
    assert.equal(JSON.parse(sent.messages[1].content).preferences.allergies,'peanuts');
    assert.equal(sent.messages.at(-1).content,'turn-29'); assert.doesNotMatch(request.body,/private-id/);
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({reply:'Try a bowl of dal.'})}}]}));
  }});
  assert.equal(result,'Try a bowl of dal.');
  await assert.rejects(chatReply({},[],{apiKey:'test',fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:{content:'{"reply":""}'}}]}))}),{statusCode:502});
});

for (const databaseUrl of ['',...(process.env.TEST_CHAT_DATABASE_URL?[process.env.TEST_CHAT_DATABASE_URL]:[])]) {
 test(`chat integration (${databaseUrl?'PostgreSQL':'local'}): memory, isolation, retries, concurrent saves and clears`,async(t)=>{
  const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'nutrilog-chat-'));
  const stub=path.join(temp,'provider.cjs'),marker=path.join(temp,'started');
  fs.writeFileSync(stub,`const fs=require('node:fs'); global.fetch=async(url,request)=>{
    const messages=JSON.parse(request.body).messages;
    const latest=messages.at(-1).content;
    if(latest.includes('provider-failure')) return new Response('SECRET',{status:500});
    if(latest.includes('slow')) { fs.writeFileSync(${JSON.stringify(marker)},'ready'); await new Promise(r=>setTimeout(r,350)); }
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({reply:JSON.stringify({context:JSON.parse(messages[1].content),turns:messages.slice(2)})})}}]}));
  };`);
  const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));
  const child=spawn(process.execPath,['--require',stub,'server.js'],{cwd:root,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:path.join(temp,'data'),DATABASE_URL:databaseUrl,POSTGRES_URL:'',VERCEL:databaseUrl?'1':'',GROQ_API_KEY:'fake',ADMIN_EMAIL:'nobody@example.test'},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{if(child.exitCode===null){child.kill();await once(child,'exit');}fs.rmSync(temp,{recursive:true,force:true});});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Startup timeout')),5000);child.stdout.once('data',()=>{clearTimeout(timer);resolve();});});
  const base=`http://127.0.0.1:${port}`;
  async function req(route,method='GET',body,token,status=200){const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;}
  async function account(prefix){const email=`${prefix}-${crypto.randomUUID()}@example.test`;await req('/api/auth/signup','POST',{email,password:'test-password',timeZone:'UTC'},undefined,201);return {email,...await req('/api/auth/login','POST',{email,password:'test-password'})};}
  const a=await account('a'),b=await account('b');
  await req('/api/ai/chat','GET',undefined,undefined,401);
  const date=new Date().toISOString().slice(0,10);
  await req('/api/meals','POST',{date,name:'My dal',calories:400,protein:25,carbs:45,fat:12},a.token,201);
  await req('/api/meals','POST',{date,name:'SECRET OTHER MEAL',calories:500,protein:15,carbs:70,fat:20},b.token,201);
  assert.deepEqual(await req('/api/ai/chat','GET',undefined,a.token),{id:null,messages:[]});
  const first={message:'Is my lunch balanced?',date,requestId:crypto.randomUUID(),conversationId:null};
  await req('/api/ai/chat','POST',{...first,message:' '},a.token,400);
  await req('/api/ai/chat','POST',{...first,date:'2026-02-30'},a.token,400);
  let chat=await req('/api/ai/chat','POST',first,a.token);
  assert.equal(chat.messages.length,2);let answer=JSON.parse(chat.messages[1].content);
  assert.equal(answer.context.meals[0].name,'My dal');assert.doesNotMatch(chat.messages[1].content,/SECRET OTHER|example.test|password|userId/);
  assert.equal((await req('/api/ai/chat','POST',first,a.token)).messages.length,2);
  await req('/api/ai/chat','POST',{...first,requestId:crypto.randomUUID()},a.token,409);
  // A lost-response retry with the original null conversation ID is accepted too.
  const second={message:'What about more protein?',date,requestId:crypto.randomUUID(),conversationId:chat.id};
  await req('/api/goals','PUT',{calories:2400,protein:160,carbs:250,fat:75},a.token);
  chat=await req('/api/ai/chat','POST',second,a.token);answer=JSON.parse(chat.messages.at(-1).content);
  assert.equal(answer.turns.length,3);assert.equal(answer.context.goals.protein,160);
  assert.equal((await req('/api/ai/chat','POST',second,a.token)).messages.length,4);
  assert.equal((await req('/api/ai/chat','GET',undefined,b.token)).messages.length,0);
  await req('/api/ai/chat','POST',{...second,requestId:crypto.randomUUID(),message:'provider-failure'},a.token,502);
  assert.equal((await req('/api/ai/chat','GET',undefined,a.token)).messages.length,4);
  const slow=req('/api/ai/chat','POST',{...second,requestId:crypto.randomUUID(),message:'slow response'},a.token,409);
  for(let i=0;i<100&&!fs.existsSync(marker);i++)await new Promise(r=>setTimeout(r,10));assert.ok(fs.existsSync(marker));
  // A pending provider call does not block writes; clearing must prevent its stale reply from restoring chat.
  const fresh=await req('/api/ai/chat','DELETE',undefined,a.token);
  await req('/api/weights','PUT',{date,kg:75},b.token);await slow;
  assert.equal((await req('/api/ai/chat','GET',undefined,a.token)).messages.length,0);
  chat=await req('/api/ai/chat','POST',{...first,conversationId:fresh.id,requestId:crypto.randomUUID(),message:'Fresh topic'},a.token);
  assert.equal(chat.messages.length,2);assert.equal(JSON.parse(chat.messages[1].content).turns.length,1);
  assert.equal((await req('/api/account/export','GET',undefined,a.token)).chat.messages.length,2);
  await req('/api/account','DELETE',{currentPassword:'test-password',confirmEmail:a.email},a.token);
  assert.equal((await req('/api/ai/chat','GET',undefined,b.token)).messages.length,0);
  if(!databaseUrl)assert.equal(Object.keys(JSON.parse(fs.readFileSync(path.join(temp,'data/app-data.json'),'utf8')).chatsByUser).length,0);
 });
}
