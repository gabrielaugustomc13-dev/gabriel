/* Tenant profile, separate from companies registered as B2B customers. */
const CompanyCore=(()=>{
const limits={legalName:160,cnpj:18,email:160,phone:40,website:250,address:500,city:100,region:2,postalCode:10};
function validate(s){
 if(s.companyProfile==null)return;
 const p=s.companyProfile;if(typeof p!=='object'||Array.isArray(p))throw Error('Dados da empresa inválidos.');
 for(const [key,max]of Object.entries({company:100,segment:100,size:100,needs:3000}))if(s[key]!==undefined&&(typeof s[key]!=='string'||s[key].length>max))throw Error('Revise os dados gerais da empresa.');
 if(!s.company?.trim())throw Error('Informe o nome da empresa.');
 for(const [key,max]of Object.entries(limits))if(p[key]!==undefined&&(typeof p[key]!=='string'||p[key].length>max))throw Error('Revise os dados de cadastro e contato da empresa.');
 if(p.cnpj){const digits=p.cnpj.replace(/\D/g,'');if(digits.length!==14||!CRMCore.validDocument(digits))throw Error('Informe um CNPJ válido ou deixe o campo vazio.');}
 if(p.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email))throw Error('Informe um e-mail válido.');
 if(p.website){let url;try{url=new URL(p.website)}catch{throw Error('Informe um site válido com https://.')}if(!['https:','http:'].includes(url.protocol))throw Error('Use um site com http:// ou https://.');}
 if(p.region&&!/^[A-Za-z]{2}$/.test(p.region))throw Error('Informe a UF com duas letras.');
}
return {validate};})();
if(typeof module!=='undefined')module.exports=CompanyCore;
