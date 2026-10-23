/* Identidade visual pertence ao ambiente contratante e acompanha sua persistência. */
(function(root){
const keys=['primary','secondary','background','menu','button'];
const defaults={light:{primary:'#173F34',secondary:'#4F703D',background:'#F5F6F8',menu:'#102E2B',button:'#173F34'},dark:{primary:'#B8E88A',secondary:'#BDE49E',background:'#101A19',menu:'#0B211E',button:'#B8E88A'}};
function validHex(v){return typeof v==='string'&&/^#[0-9a-fA-F]{6}$/.test(v)}
function validLogo(v){if(typeof v!=='string'||v.length>220000||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(v))return false;try{const b=atob(v.slice(22));return b.length>=24&&b.slice(0,8)==='\x89PNG\r\n\x1a\n'&&b.slice(12,16)==='IHDR'}catch{return false}}
function validate(b){if(b==null)return;if(typeof b!=='object'||Array.isArray(b))throw Error('Identidade visual inválida');if(b.logo&&!validLogo(b.logo))throw Error('Logo inválido. Use PNG de até 160 KB.');if(b.logos!=null&&(typeof b.logos!=='object'||Array.isArray(b.logos)))throw Error('Logos por tema inválidas');for(const mode of ['light','dark']){const logo=b.logos?.[mode];if(logo!==undefined&&logo!==''&&!validLogo(logo))throw Error('Logo do modo '+(mode==='light'?'claro':'escuro')+' inválida. Use PNG de até 160 KB.');if(b[mode]!=null&&(typeof b[mode]!=='object'||Array.isArray(b[mode])))throw Error('Tema inválido');for(const k of keys)if(b[mode]?.[k]!=null&&!validHex(b[mode][k]))throw Error('Cor inválida. Use o formato #RRGGBB.')}}
function logo(b,mode){const value=b?.logos&&Object.hasOwn(b.logos,mode)?b.logos[mode]:b?.logo;return validLogo(value)?value:''}
function editable(b){const draft=structuredClone(b||{});draft.logos={light:logo(b,'light'),dark:logo(b,'dark')};delete draft.logo;return draft}
function colors(b,mode){return {...defaults[mode],...Object.fromEntries(keys.filter(k=>validHex(b?.[mode]?.[k])).map(k=>[k,b[mode][k].toUpperCase()]))}}
function ink(hex){const rgb=hex.slice(1).match(/../g).map(x=>{const c=parseInt(x,16)/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.179?'#14201C':'#FFFFFF'}
root.BrandingCore={keys,defaults,validHex,validLogo,validate,logo,editable,colors,ink};if(typeof module!=='undefined')module.exports=root.BrandingCore;
})(globalThis);
