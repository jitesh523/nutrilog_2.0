/* Account-owned preferences, saved meals and progress. All writes use the authenticated API. */
const $product = (selector) => document.querySelector(selector);
function escapeHtml(value) {
  const el = document.createElement('span'); el.textContent = String(value ?? ''); return el.innerHTML;
}
async function loadProductData() {
  const [profile,favorites,meals,weights] = await Promise.all([
    apiRequest('/api/profile'),apiRequest('/api/favorites'),apiRequest('/api/meals'),apiRequest('/api/weights'),
  ]);
  state.profile = profile.profile; state.plan = profile.plan; state.hasRecoveryCode = profile.hasRecoveryCode;
  state.favorites = favorites.favorites; state.recentMeals = meals.meals; state.weights = weights.weights;
  hydrateProfile();
}
function hydrateProfile() {
  for (const [id,key] of [['name','displayName'],['diet','dietaryPreference'],['cuisines','cuisines'],['allergies','allergies'],['budget','budget'],['time','cookingMinutes']]) {
    const input = $product(`#profile-${id}`); if (input) input.value = state.profile[key] ?? '';
  }
}
function renderProduct() {
  renderQuickMeals(); renderProgress();
  $product('#weight-date').max = getTodayDateKey();
  $product('#selected-date').max = getTodayDateKey();
  $product('#recovery-state').textContent = state.hasRecoveryCode ? 'A recovery code is active. Keep it private; you can replace it below.' : 'No recovery code is active. Generate one now so you can recover your account if you forget your password.';
  const badge = $product('#goals-plan-badge'); badge?.classList.toggle('app-hidden',!state.plan);
  let legacy = false; try { legacy = Boolean(localStorage.getItem('nutrilog-plan-v1')); } catch {}
  $product('#legacy-plan')?.classList.toggle('app-hidden',!legacy);
}
function mealFingerprint(meal) { return JSON.stringify([meal.name.toLowerCase(),meal.calories,meal.protein,meal.carbs,meal.fat]); }
async function saveFavorite(meal) {
  try { await apiRequest('/api/favorites',{method:'POST',body:meal}); await loadProductData(); render(); showToast('Saved to favourites.'); }
  catch(error) { showToast(error.message); }
}
function renderQuickMeals() {
  $product("#usuals-panel").classList.toggle("app-hidden", !state.favorites.length && !state.recentMeals.length);
  const seen = new Set(); const recent = state.recentMeals.filter((meal) => {
    const key = mealFingerprint(meal); if (seen.has(key)) return false; seen.add(key); return true;
  }).slice(0,5);
  for (const [selector,meals,favorite] of [['#favorite-list',state.favorites,true],['#recent-meal-list',recent,false]]) {
    const list = $product(selector); list.replaceChildren();
    if (!meals.length) { const p = document.createElement('p'); p.className='helper-copy'; p.textContent=favorite ? 'Tap Save ★ on a logged meal to keep it here.' : 'Meals you log will appear here.'; list.append(p); }
    meals.forEach((meal) => {
      const row = document.createElement('div'); row.className='quick-item';
      const copy = document.createElement('div'); const title=document.createElement('strong'); title.textContent=meal.name;
      const details=document.createElement('small'); details.textContent=`${formatNumber(meal.calories)} kcal · ${formatNumber(meal.protein)}g protein`;
      copy.append(title,details); row.append(copy);
      const actions=document.createElement('div'); actions.className='button-row';
      const use=document.createElement('button'); use.type='button'; use.className='ghost-btn'; use.textContent='Use'; use.setAttribute('aria-label',`Adjust ${meal.name}`); use.onclick=()=>loadMealEditor(meal,false);
      const log=document.createElement('button'); log.type='button'; log.className='ghost-btn'; log.textContent='+ Log'; log.setAttribute('aria-label',`Log ${meal.name} for today`);
      log.onclick=async()=>{ log.disabled=true; try {
        const payload={...meal,date:getTodayDateKey(),type:getSmartMealType(),source:'saved-meal'};
        await apiRequest('/api/meals',{method:'POST',body:payload}); state.selectedDate=getTodayDateKey(); await loadDashboardData(); render(); showToast('Meal logged for today.');
      } catch(error) { showToast(error.message); } finally { log.disabled=false; } };
      actions.append(use,log);
      if(favorite) { const remove=document.createElement('button'); remove.type='button'; remove.className='text-btn'; remove.textContent='×'; remove.setAttribute('aria-label',`Remove ${meal.name} from favourites`); remove.onclick=async()=>{ try { await apiRequest(`/api/favorites/${meal.id}`,{method:'DELETE'}); await loadProductData(); render(); } catch(error){showToast(error.message);} }; actions.append(remove); }
      row.append(actions); list.append(row);
    });
  }
}
function resetMealEditor() {
  mealForm.reset(); state.editingMealId=null; state.formIngredients=[]; state.formSource='manual'; state.aiEstimate=null;
  $product('#meal-form-title').textContent='Log a meal'; $product('#save-meal-btn').textContent='Save meal'; $product('#cancel-meal-edit').classList.add('app-hidden');
  $product('#meal-type').value=getSmartMealType(); clearAnalysisUi(); resetPortions();
}
async function loadMealEditor(meal,editing) {
  if(state.aiEstimatePending) { showToast('Wait for the current estimate to finish.'); return; }
  if(!editing && !isEditableDate(state.selectedDate)) { state.selectedDate=getTodayDateKey(); await loadMealsForSelectedDate(); }
  resetMealEditor(); showSection('add-meal');
  state.editingMealId=editing ? meal.id : null; state.formIngredients=meal.ingredients || []; state.formSource=meal.source || 'saved-meal';
  for(const key of ['name','type','description','calories','protein','carbs','fat']) $product(`#meal-${key}`).value=meal[key] ?? '';
  $product('#meal-type')._userSet=true;
  $product('#meal-form-title').textContent=editing ? 'Edit your meal' : 'Reuse a meal';
  $product('#save-meal-btn').textContent=editing ? 'Save changes' : 'Save meal';
  $product('#cancel-meal-edit').classList.toggle('app-hidden',!editing);
  analysisFeedback.textContent='Saved values loaded. Adjust the portion or edit the values before saving.';
  resetPortions(); renderDateUi(); $product('#meal-name').focus();
}
function resetPortions() {
  state.portionMultiplier=1; state.portionBase=null;
  document.querySelectorAll('[data-portion]').forEach((b)=>b.setAttribute('aria-pressed',String(b.dataset.portion==='1')));
}
function setPortion(multiplier) {
  if(!state.portionBase) {
    const keys=['calories','protein','carbs','fat'];
    if(keys.some(key=>$product(`#meal-${key}`).value==='')) { showToast('Calculate or enter nutrition values first.'); return; }
    state.portionBase={ingredients:structuredClone(state.formIngredients || [])};
    keys.forEach((key)=>state.portionBase[key]=readNumber(`#meal-${key}`));
  }
  const scaled=Nutrition.scaleMeal(state.portionBase,multiplier);
  for(const key of Nutrition.keys) $product(`#meal-${key}`).value=key==='calories' ? Math.round(scaled[key]) : scaled[key];
  state.formIngredients=scaled.ingredients; state.portionMultiplier=multiplier;
  ingredientPreview.replaceChildren();
  analysisFeedback.textContent=`${multiplier} × your entered portion. Nutrition and ingredient amounts have been scaled together. Review before saving.`;
  document.querySelectorAll('[data-portion]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.portion)===multiplier)));
}
function weekDays() {
  const days=[]; for(let i=6;i>=0;i--) {
    const d=new Date(`${getTodayDateKey()}T12:00:00`); d.setDate(d.getDate()-i);
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const history=state.history.find(h=>h.date===key);
    days.push({key,label:i===0?'Today':d.toLocaleDateString(undefined,{weekday:'short'}),history,logged:Boolean(history?.mealCount)});
  } return days;
}
function renderNutritionWeek() {
  const el=$product('#weekly-chart'), days=weekDays(); if(!el) return;
  const max=Math.max(state.goals.calories,...days.map(d=>d.history?.totals.calories || 0),...days.map(d=>d.history?.goals.calories || 0),1),height=110;
  el.innerHTML=`<div class="panel-heading"><div><h2>Last 7 days</h2><p>Logged calories and each day's saved target. A dash means not logged.</p></div></div><div class="chart-bars">${days.map(day=>{
    const calories=day.history?.totals.calories || 0, goal=day.history?.goals.calories ?? state.goals.calories;
    return `<div class="chart-col"><div class="chart-bar-wrap" style="height:${height}px">${day.logged ? `<div class="chart-goal-line" style="bottom:${goal/max*height}px"></div><div class="chart-bar" style="height:${Math.max(calories/max*height,3)}px"></div>` : '<div class="chart-missing">—</div>'}</div><p class="chart-label">${day.label}</p><p class="chart-val">${day.logged ? Math.round(calories) : 'Not logged'}</p></div>`;
  }).join('')}</div><div class="chart-legend"><span><span class="legend-dot" style="background:var(--highlight)"></span>Logged calories</span><span>Dashed line: daily target</span></div>`;
}
function renderProgress() {
  const logged=weekDays().filter(d=>d.logged); const average=(key)=>logged.length ? formatNumber(logged.reduce((sum,d)=>sum+d.history.totals[key],0)/logged.length) : '—';
  $product('#progress-stats').innerHTML=`<div class="progress-stat"><span>Logging consistency</span><strong>${logged.length}/7 days</strong><span>Last 7 days</span></div><div class="progress-stat"><span>Average calories</span><strong>${average('calories')}</strong><span>Per logged day</span></div><div class="progress-stat"><span>Average protein</span><strong>${average('protein')}${logged.length?'g':''}</strong><span>Per logged day</span></div>`;
  const weights=state.weights, trend=$product('#weight-trend'), log=$product('#weight-log');
  if(!weights.length) { trend.innerHTML='<p class="helper-copy">Your first check-in starts the trend. At least two measurements are needed to draw a line.</p>'; log.replaceChildren(); return; }
  const latest=weights[weights.length-1], first=weights[0], change=+(latest.kg-first.kg).toFixed(1);
  trend.innerHTML=`<p><strong>${latest.kg} kg</strong> <span class="helper-copy">Latest · ${formatDate(latest.date)}${weights.length>1 ? ` · ${change>0?'+':''}${change} kg since ${formatDate(first.date)}` : ''}</span></p>`;
  if(weights.length>1) {
    const points=weights.slice(-60), start=Date.parse(points[0].date), end=Date.parse(points[points.length-1].date), min=Math.min(...points.map(w=>w.kg)), max=Math.max(...points.map(w=>w.kg)), range=Math.max(max-min,1);
    const coords=points.map(w=>[40+(Date.parse(w.date)-start)/Math.max(1,end-start)*620,135-(w.kg-min)/range*100]);
    trend.insertAdjacentHTML('beforeend',`<svg class="weight-chart" viewBox="0 0 700 180" role="img" aria-label="Weight trend across ${points.length} measurements, from ${points[0].kg} to ${latest.kg} kilograms"><line x1="40" y1="150" x2="660" y2="150" stroke="#494056"/><polyline points="${coords.map(p=>p.join(',')).join(' ')}" fill="none" stroke="currentColor" stroke-width="3"/>${coords.map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="4" fill="currentColor"><title>${points[i].date}: ${points[i].kg} kg</title></circle>`).join('')}<text x="40" y="174" fill="#b2adc3" font-size="12">${points[0].date}</text><text x="660" y="174" text-anchor="end" fill="#b2adc3" font-size="12">${latest.date}</text><text x="4" y="38" fill="#b2adc3" font-size="11">${max}</text><text x="4" y="139" fill="#b2adc3" font-size="11">${min}</text></svg><p class="helper-copy">Measurements connected by date; the line doesn't predict future weight. Showing the latest ${points.length} check-ins.</p>`);
  }
  log.replaceChildren(); [...weights].reverse().forEach(w=>{
    const row=document.createElement('div'); row.className='weight-log-row'; const copy=document.createElement('span'); copy.textContent=`${formatDate(w.date)} · ${w.kg} kg`;
    const actions=document.createElement('div'); actions.className='button-row'; const edit=document.createElement('button'); edit.type='button'; edit.className='text-btn'; edit.textContent='Edit'; edit.onclick=()=>{$product('#weight-date').value=w.date;$product('#weight-kg').value=w.kg;$product('#weight-kg').focus();};
    const remove=document.createElement('button');remove.type='button';remove.className='text-btn';remove.textContent='Remove';remove.onclick=async()=>{try{await apiRequest(`/api/weights/${w.date}`,{method:'DELETE'});await loadProductData();render();}catch(error){showToast(error.message);}};
    actions.append(edit,remove);row.append(copy,actions);log.append(row);
  });
}
function downloadJson(data,name) {
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),link=document.createElement('a'); const url=URL.createObjectURL(blob);
  link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
window.showRecoveryCode=(code,where='account')=>{
  const target=$product(where==='signup'?'#signup-recovery-output':'#account-recovery-output'); if(!target) return;
  target.replaceChildren(); target.classList.remove('app-hidden');
  const text=document.createElement('p');text.className='helper-copy';text.textContent='Save this recovery code somewhere private. It is shown once. A new code replaces the previous one.';
  const output=document.createElement('code');output.className='recovery-code';output.textContent=code;
  const download=document.createElement('button');download.type='button';download.className='ghost-btn';download.textContent='Download code';download.onclick=()=>downloadJson({email:state.currentUser?.email || loginEmail.value,recoveryCode:code},'nutrilog-recovery-code.json');
  const done=document.createElement('button');done.type='button';done.className='primary-btn';done.textContent=where==='signup'?'I saved it — log in':'I saved my code';done.onclick=()=>{target.replaceChildren();target.classList.add('app-hidden'); if(where==='signup') { updateAuthMode('login'); signupForm.querySelector('[type="submit"]').disabled=false; } };
  target.append(text,output,download,done); if(where==='signup')signupForm.querySelector('[type="submit"]').disabled=true;
};
async function submitProductForm(event,feedback,action) {
  event.preventDefault(); const button=event.currentTarget.querySelector('[type="submit"]'); button.disabled=true;feedback.textContent='';
  try {await action();} catch(error) {feedback.textContent=error.message;} finally {button.disabled=false;}
}
document.addEventListener('click',async(event)=>{
  const open=event.target.closest('[data-open-section]');
  if(open) {
    if(open.dataset.openSection==='add-meal' && !isEditableDate(state.selectedDate)) {state.selectedDate=getTodayDateKey(); await loadMealsForSelectedDate(); render();}
    showSection(open.dataset.openSection);
  }
  const portion=event.target.closest('[data-portion]'); if(portion) setPortion(Number(portion.dataset.portion));
});
if(IS_DASHBOARD_PAGE) {
  $product('#weight-date').value=getTodayDateKey(); $product('#plan-start-date').value=getTodayDateKey();
  $product('#cancel-meal-edit').onclick=()=>{resetMealEditor();showSection('dashboard');};
  for(const key of Nutrition.keys) $product(`#meal-${key}`).addEventListener('input',()=>{resetPortions();state.formSource='manual';state.formIngredients=[];ingredientPreview.replaceChildren();});
  $product('#meal-description').addEventListener('input',()=>{resetPortions();state.formIngredients=[];state.formSource='manual';});
  $product('#meal-type').addEventListener('change',()=>{$product('#meal-type')._userSet=true;});
  $product('#profile-form').onsubmit=e=>submitProductForm(e,$product('#profile-feedback'),async()=>{
    const response=await apiRequest('/api/profile',{method:'PUT',body:{displayName:$product('#profile-name').value,dietaryPreference:$product('#profile-diet').value,cuisines:$product('#profile-cuisines').value,allergies:$product('#profile-allergies').value,budget:$product('#profile-budget').value,cookingMinutes:Number($product('#profile-time').value)}});
    state.profile=response.profile; render();$product('#profile-feedback').textContent='Preferences saved. Your next coach request will use them.';
  });
  $product('#weight-form').onsubmit=e=>submitProductForm(e,$product('#weight-feedback'),async()=>{
    await apiRequest('/api/weights',{method:'PUT',body:{date:$product('#weight-date').value,kg:Number($product('#weight-kg').value)}});
    await loadProductData();render();$product('#weight-feedback').textContent='Check-in saved. Saving the same date updates its measurement.';
  });
  $product('#password-form').onsubmit=e=>submitProductForm(e,$product('#security-feedback'),async()=>{
    if($product('#account-new-password').value!==$product('#account-confirm-password').value)throw new Error('New passwords do not match.');
    const response=await apiRequest('/api/account/password',{method:'PUT',body:{currentPassword:$product('#account-current-password').value,password:$product('#account-new-password').value}});
    $product('#password-form').reset();state.hasRecoveryCode=true;render();window.showRecoveryCode(response.recoveryCode);$product('#security-feedback').textContent='Password updated. Save your replacement recovery code below.';
  });
  $product('#recovery-form').onsubmit=e=>submitProductForm(e,$product('#security-feedback'),async()=>{
    const response=await apiRequest('/api/account/recovery',{method:'POST',body:{currentPassword:$product('#recovery-password').value}});$product('#recovery-form').reset();state.hasRecoveryCode=true;render();window.showRecoveryCode(response.recoveryCode);
  });
  $product('#export-data-btn').onclick=async()=>{try{downloadJson(await apiRequest('/api/account/export'),`nutrilog-export-${getTodayDateKey()}.json`);$product('#export-feedback').textContent='Export downloaded.';}catch(error){$product('#export-feedback').textContent=error.message;}};
  $product('#delete-account-form').onsubmit=e=>submitProductForm(e,$product('#delete-feedback'),async()=>{
    await apiRequest('/api/account',{method:'DELETE',body:{currentPassword:$product('#delete-password').value,confirmEmail:$product('#delete-email').value}});clearSessionToken();resetClientState();window.location.href='/';
  });
  $product('#dismiss-plan-btn').onclick=()=>{localStorage.removeItem('nutrilog-plan-v1');render();};
  $product('#import-plan-btn').onclick=async()=>{try{const legacy=JSON.parse(localStorage.getItem('nutrilog-plan-v1'));const response=await apiRequest('/api/plan',{method:'PUT',body:{...legacy,startDate:getTodayDateKey()}});state.plan=response.plan;state.goals=response.goals;localStorage.removeItem('nutrilog-plan-v1');hydrateGoalForm();await loadHistory();render();showToast('Plan imported and targets saved.');}catch(error){showToast(error.message);}};
} else {
  const resetForm=$product('#reset-password-form');
  $product('#show-reset-btn').onclick=()=>{loginForm.classList.add('auth-form-hidden');signupForm.classList.add('auth-form-hidden');resetForm.classList.remove('app-hidden');$product('#reset-email').value=loginEmail.value;$product('#reset-email').focus();};
  for(const id of ['#show-login-btn','#show-signup-btn','#back-login-btn']) $product(id).addEventListener('click',()=>{resetForm.classList.add('app-hidden');if(id==='#back-login-btn')updateAuthMode('login');});
  resetForm.onsubmit=e=>submitProductForm(e,$product('#reset-feedback'),async()=>{
    if($product('#reset-password').value!==$product('#reset-confirm-password').value)throw new Error('Passwords do not match.');
    await apiRequest('/api/auth/reset-password',{method:'POST',body:{email:$product('#reset-email').value,recoveryCode:$product('#reset-code').value,password:$product('#reset-password').value}});
    clearSessionToken();loginEmail.value=$product('#reset-email').value;resetForm.reset();resetForm.classList.add('app-hidden');updateAuthMode('login');loginFeedback.textContent='Password reset. Log in, then generate a new recovery code in Settings.';
  });
}
