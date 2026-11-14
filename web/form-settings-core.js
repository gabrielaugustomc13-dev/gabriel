const FormSettingsCore = (() => {
 const text = label => ({label,type:'text',maxLength:150});
 const number = (label,min,max,integer=true) => ({label,type:'number',min,max,integer});
 const forms = {
  session:{label:'Turmas e agenda',fields:{
   title:text('Nome da aula'),instructor:text('Professor'),
   time:{label:'Horário',type:'time'},
   duration:number('Duração em minutos',5,480),capacity:number('Vagas',1,500),weeks:number('Repetições semanais',1,52)
  }},
  contract:{label:'Contratos',fields:{title:text('Plano contratado'),months:number('Mensalidades',1,36),amount:number('Valor mensal',0.01,100000000,false)}},
  plans:{label:'Planos na ficha do cliente',fields:{title:text('Plano')}},
  classes:{label:'Registro de aulas e presença',fields:{title:text('Aula')}},
  payments:{label:'Registro de cobranças',fields:{title:text('Descrição da cobrança'),amount:number('Valor',0.01,100000000,false)}},
  notes:{label:'Interações com o cliente',fields:{title:text('Tipo de interação')}},
  client:{label:'Cadastro de clientes',fields:{source:text('Origem'),role:text('Cargo'),buyRole:text('Papel na compra'),tags:{label:'Etiquetas',type:'text',maxLength:500},score:number('Pontuação',0,1000000,false)}}
 };
 function validValue(spec,value) {
  if(typeof value!=='string'||!value.trim()||value.length>(spec.maxLength||150))return false;
  if(spec.type==='number'){
   const number=Number(value);
   return Number.isFinite(number)&&number>=spec.min&&number<=spec.max&&(!spec.integer||Number.isInteger(number));
  }
  return spec.type!=='time'||/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
 }
 function validate(config){
  if(config===undefined)return;
  if(!config||typeof config!=='object'||Array.isArray(config))throw Error('Configuração de formulários inválida.');
  for(const [formKey,fields] of Object.entries(config)){
   if(!Object.hasOwn(forms,formKey)||!fields||typeof fields!=='object'||Array.isArray(fields))throw Error('Formulário inválido.');
   for(const [key,setting] of Object.entries(fields)){
    const spec=Object.hasOwn(forms[formKey].fields,key)&&forms[formKey].fields[key];
    if(!spec||!setting||!['text','list','suggestions'].includes(setting.mode)||!Array.isArray(setting.options)||setting.options.length>100||new Set(setting.options).size!==setting.options.length)throw Error('Revise as opções do campo.');
    if(setting.options.some(value=>!validValue(spec,value))||typeof setting.defaultValue!=='string'||(setting.defaultValue!==''&&!validValue(spec,setting.defaultValue)))throw Error('Valor inválido para '+spec.label+'.');
    if(setting.mode==='list'&&(!setting.options.length||(setting.defaultValue&&!setting.options.includes(setting.defaultValue))))throw Error('A lista precisa de opções e o padrão deve estar na lista.');
   }
  }
 }
 return {forms,validate};
})();
if(typeof module!=='undefined')module.exports=FormSettingsCore;
