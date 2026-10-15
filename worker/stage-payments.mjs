import {activityStatement} from './notifications.mjs';
export class PaymentError extends Error {constructor(status,message){super(message);this.status=status}}
const sql=(db,text,values=[])=>db.prepare(text).bind(...values);
const stages=['initial','accommodation','final'];
const methods=['UPI','Bank transfer','Card','Cash','Other'];
const paise=value=>Math.round(Number(value||0)*100);
export function stageBalances(total,payments){
 const budget=paise(total),first=Math.round(budget*.1),second=Math.round(budget*.6),amounts=[first,second,budget-first-second];
 const successful=payments.filter(p=>p.status==='Successful');
 let legacy=successful.filter(p=>!stages.includes(p.payment_stage)).reduce((sum,p)=>sum+paise(p.amount),0);
 return amounts.map((amount,index)=>{
  const tagged=successful.filter(p=>p.payment_stage===stages[index]).reduce((sum,p)=>sum+paise(p.amount),0);
  const applied=Math.min(Math.max(0,amount-tagged),legacy);legacy-=applied;
  return {stage:stages[index],amount,received:Math.min(amount,tagged+applied),due:Math.max(0,amount-tagged-applied)};
 });
}
function reference(value,label){const text=String(value??'').trim().toUpperCase().replace(/\s+/g,'');if(text.length>100)throw new PaymentError(400,`${label} must be under 100 characters`);return text||null}
export async function recordStagePayment(db,user,studentId,x){
 const student=await sql(db,'SELECT * FROM students WHERE id=? AND archived_at IS NULL',[studentId]).first();
 if(!student)throw new PaymentError(404,'Student not found');
 const stage=x.payment_stage,method=x.payment_method;
 if(!stages.includes(stage))throw new PaymentError(400,'Choose a payment stage');
 if(!methods.includes(method))throw new PaymentError(400,'Choose a payment method');
 const raw=String(x.amount??''),amount=Number(raw),cents=paise(amount);
 if(!/^\d+(?:\.\d{1,2})?$/.test(raw)||!Number.isSafeInteger(cents)||cents<=0)throw new PaymentError(400,'Enter a positive INR amount with at most two decimal places');
 const transaction=reference(x.transaction_id,'Transaction ID'),utr=reference(x.utr,'UTR');
 if(['UPI','Bank transfer'].includes(method)&&!utr)throw new PaymentError(400,'Enter the UTR or bank reference for this payment');
 if(method==='Card'&&!transaction)throw new PaymentError(400,'Enter the card transaction ID');
 if(method==='Other'&&!transaction&&!utr)throw new PaymentError(400,'Enter a transaction ID or payment reference');
 const paidAt=new Date(x.paid_at),notes=String(x.notes??'').trim();
 if(!x.paid_at||Number.isNaN(paidAt.getTime())||paidAt.getTime()>Date.now()+300000)throw new PaymentError(400,'Enter a valid payment date that is not in the future');
 if(notes.length>1000)throw new PaymentError(400,'Payment notes must be under 1,000 characters');
 const key=String(x.request_key||'');if(!/^[a-zA-Z0-9-]{16,80}$/.test(key))throw new PaymentError(400,'Reopen the payment form and retry');
 const existing=await sql(db,'SELECT * FROM payments WHERE request_key=?',[key]).first();
 if(existing){
  if(existing.student_id!==studentId||existing.payment_stage!==stage||(x.property_id&&existing.property_id!==String(x.property_id))||paise(existing.amount)!==cents||existing.payment_method!==method||existing.transaction_id!==transaction||existing.utr!==utr||existing.paid_at!==paidAt.toISOString()||(existing.notes||'')!==notes)throw new PaymentError(409,'This receipt request was already used for different payment details');
  return {id:existing.id,replayed:true};
 }
 const [leadRows,paymentRows]=await db.batch([sql(db,"SELECT l.* FROM leads l JOIN properties p ON p.id=l.property_id WHERE l.student_id=? AND l.status!='Lost'",[studentId]),sql(db,'SELECT * FROM payments WHERE student_id=?',[studentId])]);
 const allLeads=leadRows.results,confirmed=allLeads.filter(l=>l.status==='Converted'),eligible=confirmed.length?confirmed:allLeads;
 const ids=[...new Set(eligible.map(l=>l.property_id))];
 if(!ids.length)for(const payment of paymentRows.results)if(payment.status==='Successful'&&payment.booking==='Confirmed'&&payment.property_id&&!ids.includes(payment.property_id))ids.push(payment.property_id);
 const propertyId=String(x.property_id||(ids.length===1?ids[0]:''));
 if(!propertyId||!ids.includes(propertyId))throw new PaymentError(400,'Choose a property assigned to this student');
 const property=await sql(db,'SELECT * FROM properties WHERE id=?',[propertyId]).first();
 if(!property)throw new PaymentError(404,'Assigned property not found');
 const total=Number(property.price)||0;if(total<=0)throw new PaymentError(400,'Set the assigned property rent before recording a payment');
 const related=paymentRows.results.filter(p=>p.property_id===propertyId),balance=stageBalances(total,related).find(s=>s.stage===stage);
 if(cents>balance.due)throw new PaymentError(409,`This amount exceeds the stage balance of INR ${(balance.due/100).toFixed(2)}. Cancel and reopen the payment form.`);
 if(transaction||utr){
  const refs=[transaction,utr].filter(Boolean);
  for(const ref of refs)if(await sql(db,'SELECT id FROM payments WHERE transaction_id=? COLLATE NOCASE OR utr=? COLLATE NOCASE',[ref,ref]).first())throw new PaymentError(409,'This transaction ID or UTR has already been recorded');
 }
 const id='TXN-'+crypto.randomUUID();
 // Recheck the receipt count, rent and active student inside the insert so concurrent
 // submissions cannot both spend the same stage balance or write to an archived student.
 const insert=sql(db,`INSERT INTO payments(id,student_id,property_id,amount,status,booking,paid_at,payment_stage,payment_method,transaction_id,utr,notes,recorded_by,request_key)
 SELECT ?,?,?,?,'Successful',?,?,?, ?,?,?,?,?,?
 WHERE (SELECT COUNT(*) FROM payments WHERE student_id=? AND property_id=?)=?
 AND EXISTS(SELECT 1 FROM students s JOIN properties p ON p.id=? WHERE s.id=? AND s.archived_at IS NULL AND ROUND(COALESCE(NULLIF(p.price,0),s.budget)*100)=?)
 AND NOT EXISTS(SELECT 1 FROM payments WHERE transaction_id COLLATE NOCASE IN (?,?) OR utr COLLATE NOCASE IN (?,?))
 AND (EXISTS(SELECT 1 FROM leads WHERE student_id=? AND property_id=? AND status!='Lost') OR EXISTS(SELECT 1 FROM payments WHERE student_id=? AND property_id=? AND status='Successful' AND booking='Confirmed'))
 RETURNING id`,[id,studentId,propertyId,cents/100,(eligible.some(l=>l.property_id===propertyId&&l.status==='Converted')||related.some(p=>p.status==='Successful'&&p.booking==='Confirmed'))?'Confirmed':'On hold',paidAt.toISOString(),stage,method,transaction,utr,notes||null,user.id,key,studentId,propertyId,related.length,propertyId,studentId,paise(total),transaction,utr,transaction,utr,studentId,propertyId,studentId,propertyId]);
 let result;
 try{result=await db.batch([insert,activityStatement(db,user,'payments','created',{id,student_id:studentId,amount:cents/100,status:'Successful'},id)])}
 catch(error){if(/UNIQUE constraint/.test(error.message))throw new PaymentError(409,'This payment request, transaction ID or UTR has already been recorded');throw error}
 if(!result[0].results?.length)throw new PaymentError(409,'The booking or payment balance changed. Reopen the payment form before recording this receipt.');
 return {id};
}
