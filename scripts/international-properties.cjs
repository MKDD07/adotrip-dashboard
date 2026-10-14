const fs = require('node:fs');
const catalog = require('../data/international-properties.json');
const amenities = 'Furnished,Wi-Fi,Kitchenette,Housekeeping,Laundry,Security';
const quote = value => "'" + String(value).replace(/'/g, "''") + "'";
const imageQuery = property => `${property.location} furnished serviced apartment interior`;
function generate() {
 const sql = ['-- Fictional international serviced apartments; retain IDs and booking links.'];
 for (const property of catalog) {
  sql.push(`UPDATE properties SET price=${property.price},name=${quote(property.name)},location=${quote(property.location)},amenities=${quote(amenities)},image=NULL,image_query=${quote(imageQuery(property))} WHERE id=${quote(property.id)};`);
 }
 fs.writeFileSync('data/international-properties.sql', sql.join('\n') + '\n');
 console.log(`Prepared ${catalog.length} international property replacements.`);
}
module.exports = { catalog, amenities, imageQuery };
if (require.main === module) generate();
