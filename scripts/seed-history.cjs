const fs=require('node:fs');
const quote=value=>value==null?'NULL':typeof value==='number'?String(value):"'"+String(value).replace(/'/g,"''")+"'";
const insert=(table,record)=>`INSERT OR IGNORE INTO ${table} (${Object.keys(record).join(',')}) VALUES (${Object.values(record).map(quote).join(',')});`;
const names=['Anika Shah','Kunal Bhat','Megha Sethi','Nikhil Das','Sana Ali','Varun Pillai','Diya Rao','Aditya Jain','Riya Bose','Manav Sinha','Zoya Khan','Harsh Gupta','Tara Kapoor','Neil Menon'];
const update=(table,id,record)=>`UPDATE ${table} SET ${Object.entries(record).map(([key,value])=>`${key}=${quote(value)}`).join(',')} WHERE id=${quote(id)};`;
const sql=['-- Fictional Indian students seeking serviced apartments abroad. Demo amounts are INR equivalents.'];
let offset=0;
for(const [month,count,wins] of [['08',6,2],['09',8,3]]){
 const basePropertyId=`DEMO-HIST-PROP-2026${month}`;
 const destination=month==='08'?{city:'London',country:'United Kingdom',area:'Bloomsbury',college:'University College London'}:{city:'Toronto',country:'Canada',area:'Downtown Toronto',college:'University of Toronto'};
 const monthlyPrice=month==='08'?332800:210800;
 const apartment={name:`Demo ${destination.area} Serviced Apartments`,location:`${destination.area}, ${destination.city}, ${destination.country}`,type:'Studio',amenities:'Furnished,Wi-Fi,Kitchenette,Housekeeping,Laundry,Security',image_query:`${destination.city} furnished serviced studio apartment interior`};
 for(let group=0;group<Math.ceil(count/3);group++){
  const propertyId=group===0?basePropertyId:`${basePropertyId}-${group+1}`;
  const unit={...apartment,name:`${apartment.name} · Apt ${String(group+1).padStart(2,'0')}`};
  sql.push(insert('properties',{id:propertyId,...unit,price:monthlyPrice,rooms:3,created_at:`2026-${month}-01T09:00:00+05:30`}));
  sql.push(update('properties',propertyId,{...unit,price:monthlyPrice,rooms:3}));
 }
 for(let index=0;index<count;index++){
  const group=Math.floor(index/3),propertyId=group===0?basePropertyId:`${basePropertyId}-${group+1}`;
  const personIndex=offset+index,name=names[personIndex],id=`DEMO-HIST-STU-2026${month}-${index+1}`,day=String(3+index*3).padStart(2,'0'),date=`2026-${month}-${day}`,won=index<wins,status=won?'Converted':index===count-1?'Lost':index%2?'Interested':'Contacted';
  const profile={is_demo:true,nationality:'Indian',hometown:index%2?'Mumbai':'Delhi',college:destination.college,study_year:'1st year',destination_country:destination.country,preferred_area:destination.area,room_preference:'Furnished serviced studio',stay_duration:'6 months',move_in_date:`2026-${String(Number(month)+1).padStart(2,'0')}-01`,source:'Fictional international student enquiry',image_query:'Indian university student portrait'};
  const notes=`Fictional Indian student seeking a serviced apartment in ${destination.city}, ${destination.country}, near ${destination.college}. Requires kitchenette, Wi-Fi, housekeeping and airport arrival coordination. Demo budget and payments are INR equivalents, not market rates.`;
  sql.push(insert('students',{id,name,mobile:`+91 00000 ${3000+personIndex}`,email:`demo.history.${personIndex+1}@example.com`,city:destination.city,course:index%2?'MSc Management':'MSc Computer Science',budget:Math.ceil(monthlyPrice*1.05/1000)*1000,agent:index%2?'Priya Kapoor':'Arjun Mehta',status,notes,profile_json:JSON.stringify(profile),created_at:`${date}T10:00:00+05:30`}));
  sql.push(update('students',id,{city:destination.city,course:index%2?'MSc Management':'MSc Computer Science',notes,profile_json:JSON.stringify(profile)}));
  sql.push(insert('leads',{id:`DEMO-HIST-LEAD-2026${month}-${index+1}`,student_id:id,property_id:propertyId,status,notes:`Fictional serviced apartment enquiry in ${destination.city}. Coordinate arrival and lease dates.`,created_at:`${date}T11:00:00+05:30`}));
  sql.push(update('leads',`DEMO-HIST-LEAD-2026${month}-${index+1}`,{property_id:propertyId}));
  sql.push(insert('followups',{id:`DEMO-HIST-FU-2026${month}-${index+1}`,student_id:id,starts_at:`${date}T14:00:00+05:30`,purpose:index%2?'Callback':'Property visit',priority:'Medium',status:'Done',outcome:'Fictional demo: confirmed furnished studio, arrival date and six-month stay.',completed_at:`${date}T14:30:00+05:30`,created_at:`${date}T11:00:00+05:30`}));
  sql.push(insert('payments',{id:`DEMO-HIST-TXN-2026${month}-${index+1}`,student_id:id,property_id:propertyId,amount:won?monthlyPrice:Math.round(monthlyPrice*.2),status:won?'Successful':status==='Lost'?'Refunded':'Pending',booking:won?'Confirmed':status==='Lost'?'Cancelled':'On hold',paid_at:`${date}T15:00:00+05:30`}));
  sql.push(update('payments',`DEMO-HIST-TXN-2026${month}-${index+1}`,{property_id:propertyId}));
 }
 offset+=count;
}
fs.writeFileSync('data/demo-history.sql',sql.join('\n')+'\n');
console.log('Prepared August: 6 students, 2 bookings; September: 8 students, 3 bookings.');
