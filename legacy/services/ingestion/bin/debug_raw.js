const fs = require('fs');
const pdf = require('pdf-parse');

const file = process.argv[2];
if (!file) {
    console.error("Usage: node debug_raw.js <path_to_pdf>");
    process.exit(1);
}
const buffer = fs.readFileSync(file);

pdf(buffer).then(data => {
    console.log("--- START RAW TEXT ---");
    console.log(data.text);
    console.log("--- END RAW TEXT ---");
}).catch(err => console.error(err));
