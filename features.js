const crypto = require('node:crypto');
const Planner = require('./planner');
class InputError extends Error { constructor(message, statusCode = 400) { super(message); this.statusCode = statusCode; } }
const str = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
function number(value, min, max, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new InputError(`Enter a valid ${label} (${min}–${max}).`);
  return value;
}
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) throw new InputError('Choose a valid date.');
  return value;
}
function sanitizeProfile(body) {
  const diet = ['no-preference','vegetarian','vegan','non-vegetarian','pescatarian'];
  if (!diet.includes(body.dietaryPreference)) throw new InputError('Choose a dietary preference.');
  return { displayName:str(body.displayName,60), dietaryPreference:body.dietaryPreference,
    cuisines:str(body.cuisines,200), allergies:str(body.allergies,300), budget:str(body.budget,150),
    cookingMinutes:number(body.cookingMinutes,5,180,'cooking time') };
}
function sanitizePlan(body, today) {
  const plan = {
    currentWeight:number(body.currentWeight,30,300,'current weight'), targetWeight:number(body.targetWeight,30,300,'target weight'),
    heightCm:number(body.heightCm,100,250,'height'), age:number(body.age,18,100,'age'),
    gender:body.gender, goal:body.goal, activityLevel:body.activityLevel,
    durationWeeks:number(body.durationWeeks,1,52,'duration'), startDate:validDate(body.startDate || today),
  };
  if (!['male','female'].includes(plan.gender) || !['cutting','bulking','maintenance'].includes(plan.goal) || !Object.hasOwn(Planner.ACTIVITY,plan.activityLevel)) throw new InputError('Choose valid plan options.');
  if (plan.startDate !== today) throw new InputError('New plans start today, so the saved targets match your daily log.');
  if (plan.goal === 'cutting' && plan.targetWeight >= plan.currentWeight) throw new InputError('For fat loss, target weight must be below current weight.');
  if (plan.goal === 'bulking' && plan.targetWeight <= plan.currentWeight) throw new InputError('For weight gain, target weight must be above current weight.');
  plan.endDate = new Date(Date.parse(plan.startDate) + plan.durationWeeks * 7 * 86400000).toISOString().slice(0,10);
  plan.calculated = Planner.calcPlan(plan);
  plan.createdAt = new Date().toISOString();
  return plan;
}
function sanitizeNutrition(body) {
  return { calories:number(body.calories,0,10000,'calories'), protein:number(body.protein,0,1000,'protein'), carbs:number(body.carbs,0,2000,'carbs'), fat:number(body.fat,0,1000,'fat') };
}
function validateMeal(body) {
  if (!str(body.name,120)) throw new InputError('Give your meal a name.');
  return { name:str(body.name,120), type:['Breakfast','Lunch','Dinner','Snack','Custom'].includes(body.type) ? body.type : 'Custom',
    description:str(body.description,2000), ...sanitizeNutrition(body),
    ingredients:(Array.isArray(body.ingredients) ? body.ingredients : []).slice(0,30).map((item) => ({
      food:str(item.food,160), ...sanitizeNutrition(item),
      grams:Number.isFinite(item.grams) && item.grams >= 0 ? Math.min(item.grams,100000) : 0,
      displayAmount:Number.isFinite(item.displayAmount) && item.displayAmount >= 0 ? Math.min(item.displayAmount,100000) : 0,
      displayUnit:str(item.displayUnit,30),
    })), source:['ai','food-calculator','manual','saved-meal'].includes(body.source) ? body.source : 'manual' };
}
const recoveryHash = (code) => crypto.createHash('sha256').update(String(code || '').replace(/[^a-fA-F0-9]/g,'').toLowerCase()).digest('hex');
function issueRecoveryCode(user) {
  const raw = crypto.randomBytes(16).toString('hex');
  user.recoveryCodeHash = recoveryHash(raw);
  return raw.match(/.{1,4}/g).join('-');
}
async function handleFeatureApi(request, response, url, helpers) {
  const { readData,writeData,readJsonBody,sendJson,requireSession,hashPassword,getUserTodayDateKey,syncTodayGoalSnapshot } = helpers;
  const route = url.pathname, method = request.method;
  if (method === 'POST' && route === '/api/auth/reset-password') {
    const body = await readJsonBody(request);
    const email = str(body.email,254).toLowerCase();
    if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) throw new InputError('Use a new password with 8–128 characters.');
    const data = readData();
    const attemptKey = crypto.createHash('sha256').update(email).digest('hex');
    const now = Date.now();
    data.resetAttempts = Object.fromEntries(Object.entries(data.resetAttempts || {}).filter(([,v]) => now - v.start < 900000));
    const attempts = data.resetAttempts[attemptKey] || { start:now, count:0 };
    if (attempts.count >= 5) throw new InputError('Too many reset attempts. Try again in 15 minutes.',429);
    attempts.count++; data.resetAttempts[attemptKey] = attempts;
    const user = data.users.find((u) => u.email === email);
    if (!user?.recoveryCodeHash || recoveryHash(body.recoveryCode) !== user.recoveryCodeHash) {
      writeData(data); sendJson(response,400,{error:'The email or recovery code is incorrect, or the code has already been used.'}); return true;
    }
    user.passwordSalt = crypto.randomBytes(16).toString('hex'); user.passwordHash = hashPassword(body.password,user.passwordSalt);
    delete user.recoveryCodeHash; delete data.resetAttempts[attemptKey];
    data.sessions = data.sessions.filter((s) => s.userId !== user.id);
    writeData(data); sendJson(response,200,{ok:true}); return true;
  }
  const supported = ['/api/profile','/api/plan','/api/favorites','/api/weights','/api/account/export','/api/account/password','/api/account/recovery','/api/account'];
  if (!supported.includes(route) && !route.startsWith('/api/favorites/') && !route.startsWith('/api/weights/') && !(method === 'PUT' && route.startsWith('/api/meals/'))) return false;
  const session = requireSession(request,response); if (!session) return true;
  const data = readData(), id = session.user.id, user = data.users.find((u) => u.id === id), today = getUserTodayDateKey(user);
  const body = ['GET','HEAD'].includes(method) ? {} : await readJsonBody(request);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('A JSON object is required.');
  const verifyPassword = () => {
    if (typeof body.currentPassword !== 'string' || hashPassword(body.currentPassword,user.passwordSalt) !== user.passwordHash) throw new InputError('Your current password is incorrect.',403);
  };
  if (route === '/api/profile' && method === 'GET') {
    sendJson(response,200,{profile:data.profilesByUser[id] || {displayName:'',dietaryPreference:'no-preference',cuisines:'Indian',allergies:'',budget:'',cookingMinutes:30},plan:data.plansByUser[id] || null,hasRecoveryCode:Boolean(user.recoveryCodeHash)}); return true;
  }
  if (route === '/api/profile' && method === 'PUT') {
    data.profilesByUser[id] = sanitizeProfile(body); writeData(data); sendJson(response,200,{profile:data.profilesByUser[id]}); return true;
  }
  if (route === '/api/plan' && method === 'PUT') {
    const plan = sanitizePlan(body,today), c = plan.calculated;
    data.plansByUser[id] = plan;
    data.goalsByUser[id] = {calories:c.targetCalories,protein:c.targetProtein,carbs:c.targetCarbs,fat:c.targetFat};
    syncTodayGoalSnapshot(data,id,today); writeData(data); sendJson(response,200,{plan,goals:data.goalsByUser[id]}); return true;
  }
  if (route === '/api/plan' && method === 'DELETE') {
    delete data.plansByUser[id]; writeData(data); sendJson(response,200,{ok:true,goals:data.goalsByUser[id]}); return true;
  }
  if (route === '/api/favorites' && method === 'GET') { sendJson(response,200,{favorites:data.favorites.filter((m) => m.userId === id)}); return true; }
  if (route === '/api/favorites' && method === 'POST') {
    const favorite = { ...validateMeal(body),id:crypto.randomUUID(),userId:id,createdAt:new Date().toISOString() };
    if (data.favorites.filter((m) => m.userId === id).length >= 100) throw new InputError('You can save up to 100 favourites. Remove one to add another.');
    data.favorites.unshift(favorite); writeData(data); sendJson(response,201,{favorite}); return true;
  }
  if (route.startsWith('/api/favorites/') && method === 'DELETE') {
    const before = data.favorites.length; data.favorites = data.favorites.filter((m) => !(m.userId === id && m.id === route.split('/').pop()));
    if (before === data.favorites.length) throw new InputError('Favourite not found.',404);
    writeData(data); sendJson(response,200,{ok:true}); return true;
  }
  if (route === '/api/weights' && method === 'GET') { sendJson(response,200,{weights:data.weights.filter((w) => w.userId === id).sort((a,b) => a.date.localeCompare(b.date))}); return true; }
  if (route === '/api/weights' && method === 'PUT') {
    const date = validDate(body.date); if (date > today || date < '1900-01-01') throw new InputError('Choose today or a previous date.');
    const weight = {userId:id,date,kg:number(body.kg,20,400,'weight'),updatedAt:new Date().toISOString()};
    data.weights = data.weights.filter((w) => !(w.userId === id && w.date === date)); data.weights.push(weight);
    writeData(data); sendJson(response,200,{weight}); return true;
  }
  if (route.startsWith('/api/weights/') && method === 'DELETE') {
    data.weights = data.weights.filter((w) => !(w.userId === id && w.date === route.split('/').pop())); writeData(data); sendJson(response,200,{ok:true}); return true;
  }
  if (method === 'PUT' && route.startsWith('/api/meals/')) {
    const meal = data.meals.find((m) => m.id === route.split('/').pop() && m.userId === id);
    if (!meal) throw new InputError('Meal not found.',404);
    if (meal.date !== today) throw new InputError('Previous days are read-only.');
    Object.assign(meal,validateMeal(body),{updatedAt:new Date().toISOString()}); writeData(data); sendJson(response,200,{meal}); return true;
  }
  if (route === '/api/account/export' && method === 'GET') {
    sendJson(response,200,{exportedAt:new Date().toISOString(),account:session.user,profile:data.profilesByUser[id] || {},chat:data.chatsByUser[id] || {id:null,messages:[]},plan:data.plansByUser[id] || null,goals:data.goalsByUser[id],goalHistory:data.goalSnapshotsByUser[id],meals:data.meals.filter((m) => m.userId === id),favorites:data.favorites.filter((m) => m.userId === id),weights:data.weights.filter((w) => w.userId === id)}); return true;
  }
  if (route === '/api/account/recovery' && method === 'POST') {
    verifyPassword(); const recoveryCode = issueRecoveryCode(user); writeData(data); sendJson(response,200,{recoveryCode}); return true;
  }
  if (route === '/api/account/password' && method === 'PUT') {
    verifyPassword(); if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) throw new InputError('Use a password with 8–128 characters.');
    user.passwordSalt = crypto.randomBytes(16).toString('hex'); user.passwordHash = hashPassword(body.password,user.passwordSalt);
    data.sessions = data.sessions.filter((s) => s.userId !== id || s.token === session.token);
    const recoveryCode = issueRecoveryCode(user); writeData(data); sendJson(response,200,{ok:true,recoveryCode}); return true;
  }
  if (route === '/api/account' && method === 'DELETE') {
    verifyPassword(); if (body.confirmEmail !== user.email) throw new InputError('Type your account email exactly to confirm deletion.');
    data.users = data.users.filter((u) => u.id !== id); data.sessions = data.sessions.filter((s) => s.userId !== id);
    for (const key of ['meals','favorites','weights']) data[key] = data[key].filter((m) => m.userId !== id);
    for (const key of ['goalsByUser','goalSnapshotsByUser','profilesByUser','plansByUser','chatsByUser']) delete data[key][id];
    data.auditEvents = data.auditEvents.filter((e) => e.email !== user.email); data.notifications = data.notifications.filter((e) => e.registeredEmail !== user.email);
    delete data.resetAttempts[crypto.createHash('sha256').update(user.email).digest('hex')];
    if (data.settings.adminUserId === id) data.settings.adminUserId = null;
    writeData(data); sendJson(response,200,{ok:true}); return true;
  }
  sendJson(response,405,{error:'Method not allowed.'}); return true;
}
module.exports = {handleFeatureApi,InputError,validateMeal,sanitizeNutrition,issueRecoveryCode,sanitizePlan};
