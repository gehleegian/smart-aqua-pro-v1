import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { paginationUiHarness } from '../helpers/paginationUiHarness.mjs';

const root = new URL('../../src/', import.meta.url);
const click = (view, name) => {
  const button = view.nodes.find(node => node.type === 'button' && node.props['aria-label'] === name);
  assert.ok(button, name);
  assert.equal(Boolean(button.props.disabled), false, name + ' must be enabled');
  button.props.onClick();
};
const resize = (view, name, size) => {
  const select = view.nodes.find(node => node.type === 'select' && node.props['aria-label'] === name + ': rows per page');
  assert.ok(select);
  select.props.onChange({ target: {value:String(size)} });
};
const rows = (view, tag = 'li') => view.nodes.filter(node => node.type === tag);

test('pagination hook resets contexts/sizes, clamps shrinking data and preserves page on live updates', () => {
  const h = paginationUiHarness();
  const {useClientPagination} = h.load(new URL('hooks/useClientPagination.ts', root));
  let value;
  function Probe(props) {
    value = useClientPagination(props.items, props.scope, 5);
    return React.createElement('div', null, value.items.join(','));
  }
  const all = Array.from({length:23}, (_, index) => index + 1);
  h.render(Probe, {items:all,scope:'a'});
  value.onPageChange(5);
  h.render(Probe, {items:[...all,24],scope:'a'});
  assert.deepEqual(value.items,[21,22,23,24]);
  h.render(Probe, {items:all.slice(0,6),scope:'a'});
  assert.equal(value.page,2);
  assert.deepEqual(value.items,[6]);
  h.render(Probe, {items:all,scope:'filter-b'});
  assert.equal(value.page,1);
  value.onPageChange(3);
  h.render(Probe, {items:all,scope:'a'});
  assert.equal(value.page,1, 'returning to an earlier scope must not resurrect an old page');
  value.onPageSizeChange(10);
  h.render(Probe, {items:all,scope:'a'});
  assert.equal(value.items.length,10);
  value.onPageSizeChange(999);
  h.render(Probe, {items:all,scope:'a'});
  assert.equal(value.pageSize,10);
  h.render(Probe, {items:[],scope:'a'});
  assert.equal(value.page,1);
  assert.deepEqual(value.items,[]);
});

test('command pages preserve IDs/status, continuous numbering, size selection and aquarium isolation', () => {
  const entries=Array.from({length:23},(_,i)=>({
    id:'cmd-'+i,type:'set_light_state',state:'On',status:'done',source:'app',
    requestedByName:'Operator '+i,requestedAt:1000+i,executedAt:2000+i,error:null,
  }));
  const h=paginationUiHarness({seeds:[{aquariumId:'a',entries,error:''}],mocks:{
    'firebase/firestore':{}, '../firebase':{db:null},
  }});
  const {CommandHistory}=h.load(new URL('components/monitoring/CommandHistory.tsx',root));
  const props={aquariumId:'a'};
  let view=h.render(CommandHistory,props);
  assert.equal(rows(view).length,5);
  assert.match(view.html,/aria-label="Record 1"/);
  click(view,'Command history: page 5');
  view=h.render(CommandHistory,props);
  assert.equal(rows(view).length,3);
  assert.match(view.html,/aria-label="Record 21"/);
  assert.match(view.html,/Operator 22/);
  assert.match(view.html,/Showing 21–23 of 23 loaded commands/);
  const next=view.nodes.find(n=>n.type==='button'&&n.props['aria-label']==='Command history: next page');
  assert.equal(next.props.disabled,true);
  resize(view,'Command history',10);
  view=h.render(CommandHistory,props);
  assert.equal(rows(view).length,10);
  assert.match(view.html,/Page 1 of 3/);
  view=h.render(CommandHistory,{aquariumId:'b'});
  assert.doesNotMatch(view.html,/Operator|Record 1/);
});

test('alert page changes never acknowledge records and retain original action IDs', () => {
  const events=[];
  const alerts=Array.from({length:12},(_,i)=>({
    id:'alert-'+i,tankName:'Tank A',title:'Notice '+i,message:'Equipment notice',type:'warning',
    category:'system',lastDetectedAt:1000,acknowledgedAt:null,resolvedAt:null,origin:'server',
  }));
  const h=paginationUiHarness();
  const {AlertsList}=h.load(new URL('components/alerts/AlertsList.tsx',root));
  const props={title:'My Alerts',alerts,selectedAlertId:'alert-5',userRole:'User',
    onToggleAlert:id=>events.push(['toggle',id]),onAcknowledgeAlert:id=>events.push(['ack',id])};
  let view=h.render(AlertsList,props);
  click(view,'My Alerts: next page');
  view=h.render(AlertsList,props);
  assert.match(view.html,/aria-label="Record 6"/);
  assert.doesNotMatch(view.html,/alert-details-alert-0"/);
  assert.deepEqual(events,[]);
  view.nodes.find(n=>n.type==='button'&&n.props['aria-controls']==='alert-details-alert-5').props.onClick();
  const ack=view.nodes.find(n=>n.type==='button'&&React.Children.toArray(n.props.children).includes('Acknowledge'));
  assert.ok(ack);
  ack.props.onClick();
  assert.deepEqual(events,[['toggle','alert-5'],['ack','alert-5']]);
});

test('maintenance type filtering resets the page and filters before slicing', () => {
  const entries=Array.from({length:23},(_,i)=>({
    id:'maintenance-'+i,type:i<20?'tank_cleaning':'filter_cleaning',waterChangePercent:null,
    performedAt:1000+i,performedByName:'Caretaker',notes:'Maintenance note '+i,
    recommendationId:null,resetsCleaningCycle:i<20,
  }));
  const h=paginationUiHarness({seeds:[{aquariumId:'a',entries,error:''}],mocks:{
    'firebase/firestore':{}, '../firebase':{db:null,auth:null}, 'firebase/functions':{},
  }});
  const {MaintenanceHistory}=h.load(new URL('components/maintenance/MaintenanceHistory.tsx',root));
  let view=h.render(MaintenanceHistory,{aquariumId:'a'});
  click(view,'Maintenance history: page 3');
  view=h.render(MaintenanceHistory,{aquariumId:'a'});
  assert.match(view.html,/aria-label="Record 21"/);
  view.nodes.find(n=>n.type==='select'&&n.props['aria-label']==='Filter maintenance by type')
    .props.onChange({target:{value:'filter_cleaning'}});
  view=h.render(MaintenanceHistory,{aquariumId:'a'});
  assert.equal(rows(view).length,3);
  assert.match(view.html,/Showing 1–3 of 3 loaded maintenance records/);
  assert.match(view.html,/Maintenance note 20/);
  assert.doesNotMatch(view.html,/Maintenance note 0</);
  h.setSlot(0,{aquariumId:'a',entries:[],error:''});
  view=h.render(MaintenanceHistory,{aquariumId:'a'});
  assert.match(view.html,/Nothing of this type logged yet/);
  assert.doesNotMatch(view.html,/pagination"/);
});

test('historical table numbers are continuous and changing the date resets its page', () => {
  const entries=Array.from({length:23},(_,i)=>({recordedAt:'History record '+i,recordedAtEpoch:1000+i,sampleCount:1}));
  const h=paginationUiHarness({mocks:{'../../hooks/useRuleConfig':{useRuleConfig:()=>null}}});
  const {HistoricalDataTable}=h.load(new URL('components/dataLogs/HistoricalDataTable.tsx',root));
  const props={aquarium:{id:'a'},entries,historyLoading:false,emptyMessage:'No historical records.',paginationKey:'day-a'};
  let view=h.render(HistoricalDataTable,props);
  click(view,'Historical data: page 3');
  view=h.render(HistoricalDataTable,props);
  assert.match(view.html,/scope="row"[^>]*>21</);
  assert.match(view.html,/History record 22/);
  assert.doesNotMatch(view.html,/History record 0</);
  view=h.render(HistoricalDataTable,{...props,paginationKey:'day-b'});
  assert.match(view.html,/scope="row"[^>]*>1</);
  assert.match(view.html,/History record 0</);
  view=h.render(HistoricalDataTable,{...props,historyLoading:true});
  assert.match(view.html,/Loading history/);
  assert.doesNotMatch(view.html,/pagination"/);
});

test('report pagination does not alter summary totals or item statuses', () => {
  const h=paginationUiHarness();
  const {default:ReportSummaryView}=h.load(new URL('components/reports/ReportSummaryView.tsx',root));
  const times={normal:0,warning:0,critical:0,unavailable:0,notMonitored:0,notRecorded:0,noData:0};
  const summary={
    period:{type:'weekly',start:1000,end:2000,effectiveEnd:2000},aquarium:{id:'a'},
    recommendations:{generated:23,applied:0,dismissed:0,pending:23,actedOnPct:0,autoResolved:0,superseded:0,
      items:Array.from({length:23},(_,i)=>({id:'rec-'+i,title:'Recommendation record '+i,
        parameter:'device',severity:'warning',status:'pending',createdAt:1000,ruleId:'existing_rule'}))},
    completeness:{},alerts:{bySeverity:{},byParameter:{}},readings:{perParameter:{}},
    timeInCondition:{overall:times,perParameter:{}},
    maintenance:{items:[],nextCleaning:{nextCleaningDue:null,reason:'unavailable'}},
    devices:{commands:{},powerInterruptions:{}},
    thresholds:{status:'draft',rules:{},values:{},missing:[],draftNote:null},
  };
  let view=h.render(ReportSummaryView,{summary});
  const before=JSON.stringify(summary);
  click(view,'Report recommendations: page 3');
  view=h.render(ReportSummaryView,{summary});
  assert.match(view.html,/aria-label="Record 21"/);
  assert.match(view.html,/Recommendation record 22/);
  assert.doesNotMatch(view.html,/Recommendation record 0</);
  assert.equal((view.html.match(/>pending</g)??[]).length,3);
  assert.match(view.html,/>23<\/p><p[^>]*>Generated/);
  assert.equal(JSON.stringify(summary),before);
  view=h.render(ReportSummaryView,{summary:{...summary,aquarium:{id:'b'}}});
  assert.match(view.html,/aria-label="Record 1"/);
});
