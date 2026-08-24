(function(){
  'use strict';

  var categories=[];
  var schedules=[];
  var editingId=null;
  var bound=false;

  function byId(id){ return document.getElementById(id); }
  function escapeHtml(value){
    return String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function request(url,options){
    if(typeof apiFetch==='function') return apiFetch(url,options||{});
    return fetch(url,{credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json'},...(options||{})});
  }
  function status(message,isError){
    var el=byId('calendarAdminStatus');
    if(!el) return;
    el.textContent=message||'';
    el.style.color=isError?'var(--danger-text)':'var(--muted)';
  }
  function errorText(code){
    var map={
      BAD_NAME:'请填写活动名称',BAD_CATEGORY:'请选择活动分类',CATEGORY_DISABLED:'该分类已停用',
      BAD_DATE:'日期格式不正确',BAD_DATE_RANGE:'结束日期不能早于开始日期',BAD_RECURRENCE:'请检查循环规则',
      ITEMS_REQUIRED:'组合日程至少需要一个启用的子任务',BAD_ITEM_OFFSET:'子任务日期超出组合日程范围',
      BAD_COLOR:'颜色格式不正确',CATEGORY_NAME_EXISTS:'分类名称已存在',BAD_CATEGORY_ORDER:'分类排序数据不完整',
      NOT_FOUND:'记录不存在',INTERNAL_ERROR:'服务器处理失败'
    };
    return map[code]||code||'操作失败';
  }
  async function readJson(response){
    var data=await response.json().catch(function(){return {};});
    if(!response.ok) throw new Error(errorText(data.error));
    return data;
  }
  function numberList(value){
    return String(value||'').split(/[，,\s]+/).map(Number).filter(function(v){return Number.isInteger(v);}).filter(function(v,i,a){return a.indexOf(v)===i;}).sort(function(a,b){return a-b;});
  }

  async function loadCategories(){
    var data=await readJson(await request('/api/admin/calendar/categories',{method:'GET'}));
    categories=Array.isArray(data.categories)?data.categories:[];
    renderCategories();
    renderCategoryOptions();
  }
  async function loadSchedules(){
    var data=await readJson(await request('/api/admin/calendar/schedules',{method:'GET'}));
    schedules=Array.isArray(data.schedules)?data.schedules:[];
    renderSchedules();
  }
  async function loadAll(){
    status('正在加载活动分类与日程…');
    try{
      await Promise.all([loadCategories(),loadSchedules()]);
      status('已加载 '+categories.length+' 个分类、'+schedules.length+' 条日程。');
    }catch(error){ status(error.message,true); }
  }

  function renderCategoryOptions(selectedId){
    var select=byId('calendarScheduleCategory');
    if(!select) return;
    var current=selectedId||Number(select.value)||null;
    select.innerHTML=categories.map(function(category){
      return '<option value="'+category.id+'"'+(category.id===current?' selected':'')+'>'+escapeHtml(category.name)+(category.enabled?'':'（已停用）')+'</option>';
    }).join('');
  }
  function renderCategories(){
    var host=byId('calendarCategoryList');
    if(!host) return;
    if(!categories.length){ host.innerHTML='<div class="admin-status">暂无分类</div>'; return; }
    host.innerHTML=categories.map(function(category,index){
      return '<div class="calendar-admin-row" data-category-id="'+category.id+'" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid var(--border);">'+
        '<span style="width:18px;height:18px;border-radius:6px;background:'+escapeHtml(category.color)+'"></span><strong>'+escapeHtml(category.name)+'</strong><span class="pill">'+escapeHtml(category.code)+'</span>'+
        '<span class="admin-status">'+(category.enabled?'启用':'停用')+'</span><span style="flex:1"></span>'+
        '<button class="btn secondary" type="button" data-category-action="up"'+(index===0?' disabled':'')+'>上移</button>'+
        '<button class="btn secondary" type="button" data-category-action="down"'+(index===categories.length-1?' disabled':'')+'>下移</button>'+
        '<button class="btn secondary" type="button" data-category-action="edit">编辑</button>'+
        '<button class="btn secondary" type="button" data-category-action="status">'+(category.enabled?'停用':'启用')+'</button></div>';
    }).join('');
  }
  async function createCategory(){
    var name=String(byId('calendarCategoryName').value||'').trim();
    var color=byId('calendarCategoryColor').value;
    if(!name){ status('请填写分类名称',true); return; }
    try{
      await readJson(await request('/api/admin/calendar/categories',{method:'POST',body:JSON.stringify({name:name,color:color,sortOrder:(categories.length+1)*10})}));
      byId('calendarCategoryName').value='';
      await loadCategories();
      status('分类已新增。');
    }catch(error){ status(error.message,true); }
  }
  async function editCategory(category){
    var name=prompt('分类名称',category.name);
    if(name===null) return;
    name=String(name).trim();
    if(!name) return;
    var color=prompt('分类颜色（#RRGGBB）',category.color);
    if(color===null) return;
    try{
      await readJson(await request('/api/admin/calendar/categories/'+category.id,{method:'POST',body:JSON.stringify({name:name,color:String(color).trim()})}));
      await loadCategories(); status('分类已更新。');
    }catch(error){ status(error.message,true); }
  }
  async function changeCategoryStatus(category){
    try{
      await readJson(await request('/api/admin/calendar/categories/'+category.id+'/status',{method:'POST',body:JSON.stringify({enabled:!category.enabled})}));
      await loadAll(); status(category.enabled?'分类已停用。':'分类已启用。');
    }catch(error){ status(error.message,true); }
  }
  async function moveCategory(category,direction){
    var index=categories.findIndex(function(item){return item.id===category.id;});
    var target=index+direction;
    if(index<0||target<0||target>=categories.length) return;
    var ids=categories.map(function(item){return item.id;});
    var moved=ids.splice(index,1)[0]; ids.splice(target,0,moved);
    try{
      await readJson(await request('/api/admin/calendar/categories/reorder',{method:'POST',body:JSON.stringify({ids:ids})}));
      await loadCategories(); status('分类顺序已保存。');
    }catch(error){ status(error.message,true); }
  }

  function updateFormVisibility(){
    var type=byId('calendarScheduleType').value;
    var compositeRecurring=type==='composite'&&byId('calendarCompositeRecurring').checked;
    byId('calendarEndDateGroup').style.display=type==='single'?'none':'';
    byId('calendarCompositeRecurringGroup').style.display=type==='composite'?'':'none';
    byId('calendarRecurrenceFields').style.display=(type==='recurring'||compositeRecurring)?'':'none';
    byId('calendarCompositeFields').style.display=type==='composite'?'':'none';
    updateRecurrenceVisibility();
  }
  function updateRecurrenceVisibility(){
    var unit=byId('calendarRecurrenceUnit').value;
    var endType=byId('calendarRecurrenceEndType').value;
    byId('calendarWeekdaysGroup').style.display=unit==='week'?'':'none';
    byId('calendarMonthDayGroup').style.display=unit==='month'?'':'none';
    byId('calendarRecurrenceUntilGroup').style.display=endType==='until'?'':'none';
    byId('calendarRecurrenceCountGroup').style.display=endType==='count'?'':'none';
  }
  function compositeItemHtml(item,index){
    item=item||{};
    var mode=item.dateMode||'relative-range';
    return '<div class="calendar-composite-item" data-item-index="'+index+'" style="border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:10px;">'+
      '<input type="hidden" data-field="id" value="'+escapeHtml(item.id||'')+'" />'+
      '<div class="form-grid"><div class="form-group"><label>子任务名称</label><input data-field="name" value="'+escapeHtml(item.name||'')+'" required /></div>'+
      '<div class="form-group"><label>日期方式</label><select data-field="dateMode"><option value="relative-range"'+(mode==='relative-range'?' selected':'')+'>连续偏移</option><option value="selected-days"'+(mode==='selected-days'?' selected':'')+'>指定日期偏移</option><option value="recurring"'+(mode==='recurring'?' selected':'')+'>子任务循环</option></select></div>'+
      '<div class="form-group"><label>开始偏移（首日为0）</label><input data-field="startOffsetDays" type="number" min="0" value="'+escapeHtml(item.startOffsetDays==null?0:item.startOffsetDays)+'" /></div>'+
      '<div class="form-group"><label>结束偏移</label><input data-field="endOffsetDays" type="number" min="0" value="'+escapeHtml(item.endOffsetDays==null?0:item.endOffsetDays)+'" /></div>'+
      '<div class="form-group"><label>指定偏移（逗号分隔）</label><input data-field="selectedOffsets" value="'+escapeHtml((item.selectedOffsets||[]).join(','))+'" /></div>'+
      '<div class="form-group"><label>持续天数</label><input data-field="durationDays" type="number" min="1" value="'+escapeHtml(item.durationDays||1)+'" /></div>'+
      '<div class="form-group"><label>循环单位</label><select data-field="recurrenceUnit"><option value="day">天</option><option value="week"'+(item.recurrenceUnit==='week'?' selected':'')+'>周</option><option value="month"'+(item.recurrenceUnit==='month'?' selected':'')+'>月</option></select></div>'+
      '<div class="form-group"><label>循环间隔</label><input data-field="recurrenceInterval" type="number" min="1" value="'+escapeHtml(item.recurrenceInterval||1)+'" /></div>'+
      '<div class="form-group"><label>星期（1-7）</label><input data-field="weekdays" value="'+escapeHtml((item.weekdays||[1]).join(','))+'" /></div>'+
      '<div class="form-group"><label>每月第几日</label><input data-field="monthDay" type="number" min="1" max="31" value="'+escapeHtml(item.monthDay||1)+'" /></div>'+
      '<div class="form-group"><label>子循环结束</label><select data-field="recurrenceEndType"><option value="never">长期</option><option value="until"'+(item.recurrenceEndType==='until'?' selected':'')+'>截止偏移</option><option value="count"'+(item.recurrenceEndType==='count'?' selected':'')+'>次数</option></select></div>'+
      '<div class="form-group"><label>截止偏移</label><input data-field="recurrenceUntilOffset" type="number" min="0" value="'+escapeHtml(item.recurrenceUntilOffset==null?0:item.recurrenceUntilOffset)+'" /></div>'+
      '<div class="form-group"><label>循环次数</label><input data-field="recurrenceCount" type="number" min="1" value="'+escapeHtml(item.recurrenceCount||1)+'" /></div>'+
      '<div class="form-group"><label>开始时间</label><input data-field="startTime" type="time" value="'+escapeHtml(item.startTime||'')+'" /></div><div class="form-group"><label>结束时间</label><input data-field="endTime" type="time" value="'+escapeHtml(item.endTime||'')+'" /></div>'+
      '<div class="form-group"><label class="time-checkbox-group"><input data-field="highlighted" type="checkbox"'+(item.highlighted?' checked':'')+' />重点标记</label><label class="time-checkbox-group"><input data-field="enabled" type="checkbox"'+(item.enabled===false?'':' checked')+' />启用</label></div></div>'+
      '<div class="calendar-actions"><button class="btn secondary" type="button" data-remove-composite-item>删除子任务</button></div></div>';
  }
  function renderCompositeItems(items){
    var host=byId('calendarCompositeItems');
    host.innerHTML=(items&&items.length?items:[{}]).map(compositeItemHtml).join('');
  }
  function readCompositeItems(){
    return Array.from(document.querySelectorAll('#calendarCompositeItems .calendar-composite-item')).map(function(row,index){
      function value(name){ var el=row.querySelector('[data-field="'+name+'"]'); return el?el.value:''; }
      function checked(name){ var el=row.querySelector('[data-field="'+name+'"]'); return !!(el&&el.checked); }
      var mode=value('dateMode');
      var item={id:value('id')||null,name:value('name').trim(),description:'',color:null,sortOrder:index*10,highlighted:checked('highlighted'),enabled:checked('enabled'),dateMode:mode,startTime:value('startTime'),endTime:value('endTime')};
      if(mode==='relative-range'){ item.startOffsetDays=Number(value('startOffsetDays')); item.endOffsetDays=Number(value('endOffsetDays')); }
      if(mode==='selected-days') item.selectedOffsets=numberList(value('selectedOffsets'));
      if(mode==='recurring'){
        item.durationDays=Number(value('durationDays')); item.recurrenceUnit=value('recurrenceUnit'); item.recurrenceInterval=Number(value('recurrenceInterval'));
        item.weekdays=numberList(value('weekdays')); item.monthDay=Number(value('monthDay')); item.recurrenceEndType=value('recurrenceEndType');
        item.recurrenceUntilOffset=Number(value('recurrenceUntilOffset')); item.recurrenceCount=Number(value('recurrenceCount'));
      }
      return item;
    });
  }
  function recurrencePayload(){
    return {recurrenceUnit:byId('calendarRecurrenceUnit').value,recurrenceInterval:Number(byId('calendarRecurrenceInterval').value),weekdays:numberList(byId('calendarWeekdays').value),monthDay:Number(byId('calendarMonthDay').value),recurrenceEndType:byId('calendarRecurrenceEndType').value,recurrenceUntil:byId('calendarRecurrenceUntil').value||null,recurrenceCount:Number(byId('calendarRecurrenceCount').value)};
  }
  function schedulePayload(){
    var type=byId('calendarScheduleType').value;
    var start=byId('calendarStartDate').value;
    var payload={categoryId:Number(byId('calendarScheduleCategory').value),name:byId('calendarScheduleName').value.trim(),scheduleType:type,startDate:start,endDate:type==='single'?start:byId('calendarEndDate').value,startTime:byId('calendarStartTime').value,endTime:byId('calendarEndTime').value,color:byId('calendarUseCategoryColor').checked?null:byId('calendarScheduleColor').value,description:byId('calendarScheduleDescription').value.trim(),enabled:byId('calendarScheduleEnabled').checked};
    if(type==='recurring'||type==='composite'&&byId('calendarCompositeRecurring').checked) Object.assign(payload,recurrencePayload());
    if(type==='composite'){ payload.compositeLayout=byId('calendarCompositeLayout').value; payload.items=readCompositeItems(); }
    return payload;
  }
  function resetScheduleForm(){
    editingId=null;
    byId('calendarScheduleForm').reset();
    byId('calendarScheduleFormTitle').textContent='添加新日程';
    byId('calendarScheduleEnabled').checked=true;
    byId('calendarUseCategoryColor').checked=true;
    byId('calendarCompositeRecurring').checked=false;
    byId('calendarRecurrenceInterval').value='1';
    renderCategoryOptions(); renderCompositeItems([]); updateFormVisibility();
  }
  function editSchedule(schedule){
    editingId=schedule.id;
    byId('calendarScheduleFormTitle').textContent='编辑日程：'+schedule.name;
    renderCategoryOptions(schedule.categoryId);
    byId('calendarScheduleName').value=schedule.name||''; byId('calendarScheduleType').value=schedule.scheduleType;
    byId('calendarStartDate').value=schedule.startDate||''; byId('calendarEndDate').value=schedule.endDate||schedule.startDate||'';
    byId('calendarStartTime').value=schedule.startTime||''; byId('calendarEndTime').value=schedule.endTime||'';
    byId('calendarUseCategoryColor').checked=!schedule.color; if(schedule.color) byId('calendarScheduleColor').value=schedule.color;
    byId('calendarScheduleDescription').value=schedule.description||''; byId('calendarScheduleEnabled').checked=schedule.enabled!==false;
    byId('calendarRecurrenceUnit').value=schedule.recurrenceUnit||'day'; byId('calendarRecurrenceInterval').value=schedule.recurrenceInterval||1;
    byId('calendarWeekdays').value=(schedule.weekdays||[1]).join(','); byId('calendarMonthDay').value=schedule.monthDay||1;
    byId('calendarRecurrenceEndType').value=schedule.recurrenceEndType||'never'; byId('calendarRecurrenceUntil').value=schedule.recurrenceUntil||''; byId('calendarRecurrenceCount').value=schedule.recurrenceCount||1;
    byId('calendarCompositeRecurring').checked=!!schedule.recurrenceUnit;
    byId('calendarCompositeLayout').value=schedule.compositeLayout||'gantt'; renderCompositeItems(schedule.items||[]); updateFormVisibility();
    byId('calendarScheduleForm').scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function saveSchedule(event){
    event.preventDefault();
    var payload=schedulePayload();
    var url='/api/admin/calendar/schedules'+(editingId?'/'+editingId:'');
    try{
      await readJson(await request(url,{method:'POST',body:JSON.stringify(payload)}));
      await loadSchedules(); resetScheduleForm(); status('日程已保存。');
    }catch(error){ status(error.message,true); }
  }
  function renderSchedules(){
    var host=byId('calendarScheduleList');
    if(!host) return;
    var keyword=String(byId('calendarScheduleFilter')&&byId('calendarScheduleFilter').value||'').trim().toLowerCase();
    var state=byId('calendarScheduleStatusFilter')?byId('calendarScheduleStatusFilter').value:'all';
    var list=schedules.filter(function(item){return (!keyword||String(item.name).toLowerCase().includes(keyword))&&(state==='all'||(state==='enabled')===!!item.enabled);});
    if(!list.length){host.innerHTML='<div class="admin-status">暂无符合条件的日程</div>';return;}
    host.innerHTML=list.map(function(item){
      var category=item.category&&item.category.name||'未分类';
      return '<div class="calendar-admin-row" data-schedule-id="'+item.id+'" style="padding:12px 0;border-bottom:1px solid var(--border);"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;"><strong>'+escapeHtml(item.name)+'</strong><span class="pill">'+escapeHtml(category)+'</span><span class="pill">'+escapeHtml(item.scheduleType)+'</span><span class="admin-status">'+escapeHtml(item.startDate)+(item.endDate&&item.endDate!==item.startDate?' 至 '+escapeHtml(item.endDate):'')+' · '+(item.enabled?'启用':'停用')+'</span></div><div class="calendar-actions"><button class="btn secondary" type="button" data-schedule-action="edit">编辑</button><button class="btn secondary" type="button" data-schedule-action="copy">复制</button><button class="btn secondary" type="button" data-schedule-action="status">'+(item.enabled?'停用':'启用')+'</button><button class="btn secondary" type="button" data-schedule-action="delete">删除</button></div></div>';
    }).join('');
  }
  async function scheduleAction(schedule,action){
    if(action==='edit'){editSchedule(schedule);return;}
    if(action==='delete'&&!confirm('确定删除“'+schedule.name+'”吗？')) return;
    var url='/api/admin/calendar/schedules/'+schedule.id;
    var options={method:'POST'};
    if(action==='copy') url+='/copy';
    if(action==='status'){url+='/status';options.body=JSON.stringify({enabled:!schedule.enabled});}
    if(action==='delete') options={method:'DELETE'};
    try{await readJson(await request(url,options));await loadSchedules();status('日程操作成功。');}catch(error){status(error.message,true);}
  }

  function bind(){
    if(bound||!byId('calendarScheduleForm')) return;
    bound=true;
    byId('calendarCategoryAddBtn').addEventListener('click',createCategory);
    byId('calendarAdminReloadBtn').addEventListener('click',loadAll);
    byId('calendarScheduleType').addEventListener('change',updateFormVisibility);
    byId('calendarCompositeRecurring').addEventListener('change',updateFormVisibility);
    byId('calendarRecurrenceUnit').addEventListener('change',updateRecurrenceVisibility);
    byId('calendarRecurrenceEndType').addEventListener('change',updateRecurrenceVisibility);
    byId('calendarAddCompositeItemBtn').addEventListener('click',function(){var host=byId('calendarCompositeItems');host.insertAdjacentHTML('beforeend',compositeItemHtml({},host.children.length));});
    byId('calendarCompositeItems').addEventListener('click',function(event){var button=event.target.closest('[data-remove-composite-item]');if(button)button.closest('.calendar-composite-item').remove();});
    byId('calendarScheduleForm').addEventListener('submit',saveSchedule);
    byId('calendarScheduleCancelBtn').addEventListener('click',resetScheduleForm);
    byId('calendarScheduleFilter').addEventListener('input',renderSchedules);
    byId('calendarScheduleStatusFilter').addEventListener('change',renderSchedules);
    byId('calendarCategoryList').addEventListener('click',function(event){
      var row=event.target.closest('[data-category-id]');var action=event.target.getAttribute('data-category-action');if(!row||!action)return;
      var category=categories.find(function(item){return item.id===Number(row.getAttribute('data-category-id'));});if(!category)return;
      if(action==='edit')editCategory(category);else if(action==='status')changeCategoryStatus(category);else moveCategory(category,action==='up'?-1:1);
    });
    byId('calendarScheduleList').addEventListener('click',function(event){
      var row=event.target.closest('[data-schedule-id]');var action=event.target.getAttribute('data-schedule-action');if(!row||!action)return;
      var schedule=schedules.find(function(item){return item.id===Number(row.getAttribute('data-schedule-id'));});if(schedule)scheduleAction(schedule,action);
    });
    renderCompositeItems([]); updateFormVisibility();
  }

  window.loadAdminCalendar=function(){ bind(); return loadAll(); };
})();
