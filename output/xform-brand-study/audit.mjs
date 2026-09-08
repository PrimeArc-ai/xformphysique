import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=dirname(fileURLToPath(import.meta.url));
const repo=resolve(root,'../..');
const files=['src/styles.css','src/admin.css','src/profile-photos.css'];
const source=[];
for(const file of files){
  const css=await readFile(resolve(repo,file),'utf8');
  const counts={};
  for(const [raw] of css.matchAll(/#[0-9a-f]{3,8}\b/gi)){
    const hex=raw.toUpperCase();counts[hex]=(counts[hex]||0)+1;
  }
  source.push({file,sha256:createHash('sha256').update(css).digest('hex'),topColours:Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,20)});
}
const dark={background:'#090B0D',surface:'#101419',raised:'#171C20',sidebar:'#0B0D10',border:'#293036',text:'#F4F6F1',muted:'#9AA1A5',brand:'#B8FF2B',action:'#B8FF2B',actionText:'#121608',active:'#1C2512',activeText:'#B8FF2B'};
const light={background:'#F6F7F2',surface:'#FFFFFF',raised:'#EBEFE5',sidebar:'#EFF2E9',border:'#D7DED2',text:'#1C2921',muted:'#59695D',brand:'#B8FF2B',action:'#314B36',actionText:'#FFFFFF',active:'#DCE8CC',activeText:'#314B36'};
const original=await readFile(resolve(repo,'src/styles.css'),'utf8');
const darkSourceVerification=Object.fromEntries(Object.entries(dark).map(([name,hex])=>[name,original.toUpperCase().includes(hex)]));
if(Object.values(darkSourceVerification).includes(false))throw Error(`Non-source dark token: ${JSON.stringify(darkSourceVerification)}`);
function luminance(hex){const rgb=hex.match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
const contrastChecks=[];
for(const [theme,tokens] of Object.entries({dark,light})){
  for(const [foreground,background] of [['text','background'],['text','surface'],['muted','surface'],['muted','raised'],['muted','active'],['actionText','action'],['activeText','active']]){
    const ratio=contrast(tokens[foreground],tokens[background]);
    contrastChecks.push({theme,foreground,background,ratio:Number(ratio.toFixed(2)),normalTextMinimum:4.5,pass:ratio>=4.5});
  }
}
if(contrastChecks.some(check=>!check.pass))throw Error(JSON.stringify(contrastChecks));
const evidence={scope:'Static design previews only; no app, account or database changes.',source,darkSourceVerification,tokens:{dark,light},contrastChecks,typography:{family:'Inter',bundled:'InterVariable 4.1',source:'https://rsms.me/inter/',license:'SIL Open Font License 1.1'},geometry:{largePanelRadius:16,statRadius:12,controlRadius:8,productMarkRadius:11},notes:['Light values are a proposed theme, not values found in the current app.','Contrast checks cover listed token pairs only; these are not a full accessibility audit.','All dashboard data is illustrative. Admin client data is limited to codes and assignments.']};
await writeFile(resolve(root,'tokens-and-source-audit.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(`Verified ${Object.keys(dark).length} source-backed dark tokens and ${contrastChecks.length} text contrast pairs.`);
