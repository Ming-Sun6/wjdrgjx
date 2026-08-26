(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.AdminCalendarModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  function clone(value){return JSON.parse(JSON.stringify(value==null?{}:value));}
  function uniqueSorted(values){return Array.from(new Set(values)).sort(function(a,b){return a-b;});}
  function parseNumberList(value){
    var source=Array.isArray(value)?value:String(value||'').split(/[,，\s]+/);
    return uniqueSorted(source.map(Number).filter(Number.isInteger));
  }
  function parseDateList(value){
    var source=Array.isArray(value)?value:String(value||'').split(/[,，\s]+/);
    return Array.from(new Set(source.map(function(item){return String(item).trim();}).filter(validDate))).sort();
  }
  function validDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;var parts=value.split('-').map(Number),date=new Date(Date.UTC(parts[0],parts[1]-1,parts[2]));return date.getUTCFullYear()===parts[0]&&date.getUTCMonth()===parts[1]-1&&date.getUTCDate()===parts[2];}
  function addDays(value,amount){
    if(!value)return '';
    var parts=String(value).split('-').map(Number);
    var date=new Date(Date.UTC(parts[0],parts[1]-1,parts[2]+Number(amount||0)));
    return [date.getUTCFullYear(),String(date.getUTCMonth()+1).padStart(2,'0'),String(date.getUTCDate()).padStart(2,'0')].join('-');
  }
  function diffDays(start,end){
    if(!start||!end)return 0;
    var a=String(start).split('-').map(Number),b=String(end).split('-').map(Number);
    return Math.round((Date.UTC(b[0],b[1]-1,b[2])-Date.UTC(a[0],a[1]-1,a[2]))/86400000);
  }
  function recurrenceValue(source,name,fallback){
    if(source[name]!==undefined&&source[name]!==null)return clone(source[name]);
    var nested=source.recurrence||{};
    var nestedName={recurrenceUnit:'unit',recurrenceInterval:'interval',recurrenceEndType:'endType',recurrenceUntil:'until',recurrenceUntilOffset:'untilOffset',recurrenceCount:'count'}[name]||name;
    return nested[nestedName]!==undefined&&nested[nestedName]!==null?clone(nested[nestedName]):fallback;
  }
  function itemToEditor(item){
    var next=clone(item);
    if(next.dateMode!=='recurring')return next;
    next.recurrenceUnit=recurrenceValue(next,'recurrenceUnit','day');
    next.recurrenceInterval=Number(recurrenceValue(next,'recurrenceInterval',1));
    next.weekdays=parseNumberList(recurrenceValue(next,'weekdays',[1]));
    next.monthDay=Number(recurrenceValue(next,'monthDay',1));
    next.recurrenceEndType=recurrenceValue(next,'recurrenceEndType','never');
    next.recurrenceUntil=recurrenceValue(next,'recurrenceUntil',null);
    next.recurrenceUntilOffset=Number(recurrenceValue(next,'recurrenceUntilOffset',0));
    next.recurrenceCount=Number(recurrenceValue(next,'recurrenceCount',1));
    return next;
  }
  function nextSortOrder(values){
    var orders=(values||[]).map(Number).filter(Number.isInteger);
    return orders.length?Math.max.apply(Math,orders)+10:0;
  }
  function scheduleToEditor(schedule,options){
    var editor=clone(schedule),settings=options||{};
    editor.structure=editor.scheduleType==='composite'?'composite':'normal';
    editor.dateMode=editor.scheduleType==='date-list'?'list':'range';
    editor.repeat=!!(editor.scheduleType==='recurring'||editor.recurrenceUnit||editor.recurrence);
    editor.durationDays=Math.max(1,diffDays(editor.startDate,editor.endDate||editor.startDate)+1);
    editor.legacyDates=parseDateList(editor.legacyDates||[]);
    editor.recurrenceUnit=recurrenceValue(editor,'recurrenceUnit','day');
    editor.recurrenceInterval=Number(recurrenceValue(editor,'recurrenceInterval',1));
    editor.weekdays=parseNumberList(recurrenceValue(editor,'weekdays',[1]));
    editor.monthDay=Number(recurrenceValue(editor,'monthDay',1));
    editor.recurrenceEndType=recurrenceValue(editor,'recurrenceEndType','never');
    editor.recurrenceUntil=recurrenceValue(editor,'recurrenceUntil',null);
    editor.recurrenceCount=Number(recurrenceValue(editor,'recurrenceCount',1));
    editor.items=(editor.items||[]).map(itemToEditor);
    if(settings.shiftToDate)return scheduleToEditor(shiftPresetToDate(editor,settings.shiftToDate));
    return editor;
  }
  function cleanItem(item,parentStart){
    var next=clone(item);
    if(next.dateMode==='selected-days')next.selectedOffsets=parseNumberList(next.selectedOffsets);
    if(next.dateMode==='recurring'){
      next.weekdays=next.recurrenceUnit==='week'?parseNumberList(next.weekdays):[];
      next.monthDay=next.recurrenceUnit==='month'?(Number(next.monthDay)||1):null;
      next.recurrenceUntil=next.recurrenceEndType==='until'?(next.recurrenceUntil||addDays(parentStart,Number(next.recurrenceUntilOffset)||0)):null;
      next.recurrenceCount=next.recurrenceEndType==='count'?(Number(next.recurrenceCount)||1):null;
      if(next.recurrenceEndType!=='until')next.recurrenceUntilOffset=null;
    }
    return next;
  }
  function editorToPayload(editor){
    var source=clone(editor),structure=source.structure||(source.scheduleType==='composite'?'composite':'normal');
    var isList=structure==='normal'&&source.dateMode==='list';
    var repeat=!isList&&!!source.repeat;
    var duration=Math.max(1,Math.min(366,Number(source.durationDays)||1));
    var dates=isList?parseDateList(source.legacyDates):[];
    var start=isList?(dates[0]||source.startDate):source.startDate;
    var payload={
      categoryId:Number(source.categoryId),
      name:String(source.name||'').trim(),
      scheduleType:structure==='composite'?'composite':isList?'date-list':repeat?'recurring':duration===1?'single':'continuous',
      startDate:start||'',
      endDate:isList?(dates[dates.length-1]||start||''):addDays(start,duration-1),
      startTime:source.startTime||'',
      endTime:source.endTime||'',
      color:source.color||null,
      description:String(source.description||'').trim(),
      sortOrder:Number.isInteger(Number(source.sortOrder))?Number(source.sortOrder):0,
      enabled:source.enabled!==false
    };
    if(source.fontBold===true)payload.fontBold=true;
    if(isList)payload.legacyDates=dates;
    if(repeat){
      payload.recurrenceUnit=source.recurrenceUnit||'day';
      payload.recurrenceInterval=Number(source.recurrenceInterval)||1;
      payload.weekdays=payload.recurrenceUnit==='week'?parseNumberList(source.weekdays):[];
      payload.monthDay=payload.recurrenceUnit==='month'?(Number(source.monthDay)||1):null;
      payload.recurrenceEndType=source.recurrenceEndType||'never';
      payload.recurrenceUntil=payload.recurrenceEndType==='until'?(source.recurrenceUntil||null):null;
      payload.recurrenceCount=payload.recurrenceEndType==='count'?(Number(source.recurrenceCount)||1):null;
    }
    if(structure==='composite'){
      payload.compositeLayout=source.compositeLayout||'gantt';
      payload.items=(source.items||[]).map(function(item){return cleanItem(item,start);});
    }
    return payload;
  }
  function shiftPresetToDate(payload,today){
    var shifted=clone(payload);
    if(shifted.scheduleType==='date-list'&&shifted.legacyDates&&shifted.legacyDates.length){
      var dates=parseDateList(shifted.legacyDates),delta=diffDays(dates[0],today);
      shifted.legacyDates=dates.map(function(date){return addDays(date,delta);});
      shifted.startDate=shifted.legacyDates[0];
      shifted.endDate=shifted.legacyDates[shifted.legacyDates.length-1];
      return shifted;
    }
    if(shifted.startDate){
      var originalStart=shifted.startDate,delta=diffDays(originalStart,today),duration=Math.max(1,diffDays(originalStart,shifted.endDate||originalStart)+1);
      shifted.startDate=today;
      shifted.endDate=addDays(today,duration-1);
      if(shifted.recurrenceEndType==='until'&&shifted.recurrenceUntil)shifted.recurrenceUntil=addDays(shifted.recurrenceUntil,delta);
    }
    return shifted;
  }

  return{scheduleToEditor:scheduleToEditor,editorToPayload:editorToPayload,parseDateList:parseDateList,parseNumberList:parseNumberList,shiftPresetToDate:shiftPresetToDate,addDays:addDays,diffDays:diffDays,nextSortOrder:nextSortOrder};
});
