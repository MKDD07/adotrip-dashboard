import { execFileSync } from 'node:child_process';
const python = `import sqlite3,json,sys
x=json.load(sys.stdin)
c=sqlite3.connect(x['file']);c.row_factory=sqlite3.Row
with c:
 if 'schema' in x:c.executescript(x['schema']);r=[]
 else:
  r=[]
  for s in x['statements']:
   q=c.execute(s['sql'],s['values']);r.append({'results':[dict(a) for a in q.fetchall()] if q.description else [],'success':True})
print(json.dumps(r))`;
export function database(file) {
 const execute = statements => JSON.parse(execFileSync('python3',['-c',python],{input:JSON.stringify({file,statements}),encoding:'utf8',stdio:['pipe','pipe','pipe']}));
 const db={prepare(sql){return {sql,values:[],bind(...values){this.values=values;return this},async first(){return execute([this])[0].results[0]||null},async run(){return execute([this])[0]}}},async batch(statements){return execute(statements)}};return db;
}
