const fs=require('node:fs');
const {catalog}=require('./international-properties.cjs');
const prices=[...catalog,...['DEMO-HIST-PROP-202608','DEMO-HIST-PROP-202608-2'].map(id=>({id,price:332800})),...['DEMO-HIST-PROP-202609','DEMO-HIST-PROP-202609-2','DEMO-HIST-PROP-202609-3'].map(id=>({id,price:210800}))];
const sql=['-- Fictional INR monthly estimates; successful demo payments represent one month, other demo payments a 20% booking amount.'];
for(const {id,price} of prices)sql.push(`UPDATE properties SET price=${price} WHERE id='${id}';`);
// Only the original seeded students and payments are changed.
const students=[...Array.from({length:10},(_,i)=>`DEMO-STU-${String(i+1).padStart(3,'0')}`),...['08','09'].flatMap(month=>Array.from({length:month==='08'?6:8},(_,i)=>`DEMO-HIST-STU-2026${month}-${i+1}`)),'STU-1048','STU-1049','STU-1050','STU-1051'];
const payments=[...Array.from({length:10},(_,i)=>`DEMO-TXN-${i+1}`),...['08','09'].flatMap(month=>Array.from({length:month==='08'?6:8},(_,i)=>`DEMO-HIST-TXN-2026${month}-${i+1}`)),'TXN-83021','TXN-83022'];
for(const id of students)sql.push(`UPDATE students SET budget=(SELECT CAST((p.price*1.05+999)/1000 AS INTEGER)*1000 FROM leads l JOIN properties p ON p.id=l.property_id WHERE l.student_id=students.id ORDER BY l.created_at DESC LIMIT 1) WHERE id='${id}' AND EXISTS(SELECT 1 FROM leads l JOIN properties p ON p.id=l.property_id WHERE l.student_id=students.id);`);
for(const id of payments)sql.push(`UPDATE payments SET amount=(SELECT CASE WHEN payments.status='Successful' THEN price ELSE CAST(price*0.2 AS INTEGER) END FROM properties WHERE id=payments.property_id) WHERE id='${id}' AND EXISTS(SELECT 1 FROM properties WHERE id=payments.property_id);`);
const oldBudgets=[14500,22000,16500,14000,18000,21000,12500,15000,17000,13500];
for(let index=0;index<10;index++){
 const studentId=`DEMO-STU-${String(index+1).padStart(3,'0')}`,budget=Math.ceil(catalog[index].price*1.05/1000)*1000;
 sql.push(`UPDATE students SET notes=replace(notes,'₹${oldBudgets[index]}','₹${budget}') WHERE id='${studentId}';`);
 sql.push(`UPDATE followups SET outcome=replace(outcome,'₹${oldBudgets[index]}','₹${budget}') WHERE id='DEMO-FU-${index+1}-01';`);
}
fs.writeFileSync('data/demo-prices.sql',sql.join('\n')+'\n');
console.log(`Prepared ${prices.length} rents, ${students.length} demo budgets and ${payments.length} demo payments.`);
