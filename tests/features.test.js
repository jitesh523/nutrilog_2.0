const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {dayStatus,scaleMeal}=require('../nutrition');
const {buildAdviceContext}=require('../ai');
const nutrition={calories:500,protein:25,carbs:65,fat:15};
test('unfinished days are neutral and serving changes scale every ingredient',()=>{
  assert.equal(dayStatus(nutrition,{calories:2200,protein:150},1,true).label,'Day in progress');
  assert.equal(dayStatus({calories:0},{calories:2200},0,false).label,'Not logged');
  const meal={...nutrition,ingredients:[{...nutrition,grams:150,displayAmount:1}]};
  const half=scaleMeal(meal,.5);assert.equal(half.calories,250);assert.equal(half.ingredients[0].grams,75);assert.equal(half.ingredients[0].displayAmount,.5);assert.equal(meal.ingredients[0].grams,150);
});
test('saved preferences enter AI context without account or recovery secrets',()=>{
  const data={profilesByUser:{a:{dietaryPreference:'vegetarian',allergies:'peanuts',cookingMinutes:15}},users:[{recoveryCodeHash:'secret'}],meals:[]};
  const context=buildAdviceContext(data,'a','2026-10-08',nutrition,[]);
  assert.equal(context.preferences.allergies,'peanuts');assert.doesNotMatch(JSON.stringify(context),/secret|recovery/);
});
for(const databaseUrl of ['',...(process.env.TEST_FEATURE_DATABASE_URL?[process.env.TEST_FEATURE_DATABASE_URL]:[])]) {
 test(`full product flow (${databaseUrl?'PostgreSQL':'local'}): plans, editing, saved meals, preferences, check-ins, recovery and deletion`,async(t)=>{
  const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'nutrilog-features-'));
  const net=require('node:net'),socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));
  const server=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:temp,DATABASE_URL:databaseUrl,POSTGRES_URL:'',VERCEL:databaseUrl?'1':'',ADMIN_EMAIL:'nobody@example.test'},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{if(server.exitCode===null){server.kill();await once(server,'exit');}fs.rmSync(temp,{recursive:true,force:true});});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server did not start')),5000);server.stdout.once('data',()=>{clearTimeout(timer);resolve();});server.once('exit',()=>{clearTimeout(timer);reject(new Error('Server exited'));});});
  const base=`http://127.0.0.1:${port}`;
  async function req(route,method='GET',body,token,status=200){const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();assert.equal(response.status,status,`${method} ${route}: ${JSON.stringify(data)}`);return data;}
  const suffix=crypto.randomUUID(),emailA=`a-${suffix}@example.test`,emailB=`b-${suffix}@example.test`,password='original-password';
  const signup=await req('/api/auth/signup','POST',{email:emailA,password,timeZone:'UTC'},undefined,201);assert.match(signup.recoveryCode,/^[a-f0-9-]+$/);
  await req('/api/auth/signup','POST',{email:emailB,password,timeZone:'UTC'},undefined,201);
  let token=(await req('/api/auth/login','POST',{email:emailA,password})).token;
  const tokenB=(await req('/api/auth/login','POST',{email:emailB,password})).token;
  const today=new Date().toISOString().slice(0,10);
  const profile={displayName:'A',dietaryPreference:'vegetarian',cuisines:'South Indian',allergies:'peanuts',budget:'₹100',cookingMinutes:15};
  await req('/api/profile','PUT',profile,token);assert.equal((await req('/api/profile','GET',undefined,tokenB)).profile.displayName,'');
  const inputs={currentWeight:75,targetWeight:70,heightCm:175,age:25,gender:'male',goal:'cutting',activityLevel:'moderately_active',durationWeeks:12,startDate:today,calculated:{targetCalories:1}};
  const plan=await req('/api/plan','PUT',inputs,token);assert.ok(plan.goals.calories>1000);assert.notEqual(plan.plan.calculated.targetCalories,1);assert.equal((await req('/api/profile','GET',undefined,tokenB)).plan,null);
  assert.deepEqual((await req('/api/goals','GET',undefined,token)).goals,plan.goals);
  await req('/api/plan','PUT',{...inputs,currentWeight:-5},token,400);
  const meal=(await req('/api/meals','POST',{date:today,name:'Dal and rice',type:'Lunch',...nutrition},token,201)).meal;
  await req(`/api/meals/${meal.id}`,'PUT',{...meal,name:'Edited',calories:600},tokenB,404);
  await req(`/api/meals/${meal.id}`,'PUT',{...meal,name:'Edited',calories:600},token);
  assert.equal((await req('/api/meals','GET',undefined,token)).meals[0].calories,600);
  assert.equal((await req('/api/history','GET',undefined,token)).days[0].status,'Day in progress');
  await req('/api/meals','POST',{date:today,name:'',...nutrition},token,400);
  const favorite=(await req('/api/favorites','POST',meal,token,201)).favorite;
  assert.equal((await req('/api/favorites','GET',undefined,tokenB)).favorites.length,0);
  await req(`/api/favorites/${favorite.id}`,'DELETE',undefined,tokenB,404);
  await req('/api/weights','PUT',{date:today,kg:75},token);await req('/api/weights','PUT',{date:today,kg:74.8},token);
  assert.equal((await req('/api/weights','GET',undefined,token)).weights.length,1);assert.equal((await req('/api/weights','GET',undefined,tokenB)).weights.length,0);
  await req('/api/weights','PUT',{date:'2026-02-30',kg:75},token,400);
  await req('/api/weights','PUT',{date:'2099-01-01',kg:75},token,400);
  await req('/api/weights','PUT',{date:today,kg:-1},token,400);
  const exported=await req('/api/account/export','GET',undefined,token);assert.equal(exported.profile.allergies,'peanuts');assert.equal(exported.meals.length,1);assert.doesNotMatch(JSON.stringify(exported),/passwordHash|passwordSalt|recoveryCodeHash|"token"/);
  token=(await req('/api/auth/login','POST',{email:emailA,password})).token;
  assert.equal((await req('/api/profile','GET',undefined,token)).plan.goal,'cutting');
  assert.equal((await req('/api/weights','GET',undefined,token)).weights[0].kg,74.8);
  const custom={calories:2300,protein:140,carbs:250,fat:70};await req('/api/goals','PUT',custom,token);
  assert.equal((await req('/api/profile','GET',undefined,token)).plan,null);assert.deepEqual((await req('/api/goals','GET',undefined,token)).goals,custom);
  await req('/api/account/recovery','POST',{currentPassword:'wrong'},token,403);
  const replaced=await req('/api/account/recovery','POST',{currentPassword:password},token);
  await req('/api/auth/reset-password','POST',{email:emailA,recoveryCode:signup.recoveryCode,password:'replacement-password'},undefined,400);
  await req('/api/auth/reset-password','POST',{email:emailA,recoveryCode:replaced.recoveryCode,password:'replacement-password'});
  await req('/api/auth/session','GET',undefined,token,401);
  await req('/api/auth/reset-password','POST',{email:emailA,recoveryCode:replaced.recoveryCode,password:'another-password'},undefined,400);
  token=(await req('/api/auth/login','POST',{email:emailA,password:'replacement-password'})).token;
  assert.equal((await req('/api/profile','GET',undefined,token)).hasRecoveryCode,false);
  const changed=await req('/api/account/password','PUT',{currentPassword:'replacement-password',password:'third-password'},token);assert.ok(changed.recoveryCode);
  await req('/api/account','DELETE',{currentPassword:'third-password',confirmEmail:emailB},token,400);
  await req('/api/account','DELETE',{currentPassword:'third-password',confirmEmail:emailA},token);
  await req('/api/auth/session','GET',undefined,token,401);await req('/api/auth/login','POST',{email:emailA,password:'third-password'},undefined,401);
  assert.equal((await req('/api/account/export','GET',undefined,tokenB)).meals.length,0);
  await req('/api/account','DELETE',{currentPassword:password,confirmEmail:emailB},tokenB);
  if(!databaseUrl){const stored=JSON.parse(fs.readFileSync(path.join(temp,'app-data.json'),'utf8'));assert.equal(stored.users.length,0);assert.equal(stored.meals.length,0);assert.equal(stored.weights.length,0);assert.equal(stored.favorites.length,0);assert.equal(Object.keys(stored.profilesByUser).length,0);assert.equal(Object.keys(stored.plansByUser).length,0);assert.doesNotMatch(JSON.stringify(stored),new RegExp(emailA));}
 });
}
