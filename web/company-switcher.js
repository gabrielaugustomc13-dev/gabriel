/* Company selection lives under the logo; authorized companies come from the server. */
let companySwitchBusy=false;
function renderCompanySwitcher(){
 const box=document.querySelector('aside>.workspace');if(!box||!crmSession)return;
 const name=workspaces.items.find(w=>w.id===activeWorkspace)?.name||state.company;
 if(crmSession.role!=='master'){box.textContent=name;if(crmSession.role==='admin')companyEditButton(box);return}
 box.innerHTML=`<label class="sidebar-company-label"><span>EMPRESA</span><select aria-label="Trocar empresa" title="Trocar empresa" ${companySwitchBusy?'disabled aria-busy="true"':''}>${workspaces.items.map(w=>`<option value="${esc(w.id)}" ${w.id===activeWorkspace?'selected':''}>${esc(w.name)}</option>`).join('')}<option value="action:new-company">＋ Criar empresa</option></select></label>`;
 companyEditButton(box);
 const select=box.querySelector('select');
 select.onchange=async()=>{
  const id=select.value;if(id==='action:new-company'){select.value=activeWorkspace;workspaceForm();return}
  if(companySwitchBusy||id===activeWorkspace)return;
  companySwitchBusy=true;renderCompanySwitcher();
  try{await switchWorkspace(id)}finally{companySwitchBusy=false;renderCompanySwitcher()}
 };
}
const companySwitcherRenderBefore=render;render=function(){companySwitcherRenderBefore();renderCompanySwitcher()};
const companySwitcherWorkspaceBefore=renderWorkspaceBar;renderWorkspaceBar=function(){companySwitcherWorkspaceBefore();renderCompanySwitcher()};
const companySwitcherThemeBefore=applyTheme;applyTheme=function(theme){companySwitcherThemeBefore(theme);renderCompanySwitcher()};
const companySwitcherStyles=document.createElement('style');companySwitcherStyles.textContent=`aside>.workspace:has(.sidebar-company-label){padding:12px 13px}.sidebar-company-label{display:block;min-width:0;color:inherit}.sidebar-company-label>span{display:block;font-size:9px;letter-spacing:.09em;opacity:.6;margin-bottom:5px}aside .workspace .sidebar-company-label select{display:block;width:100%;min-width:0;margin:0;padding:3px 0;border:0;border-radius:3px;background:transparent;color:inherit;font-size:13px;font-weight:600;cursor:pointer;overflow:hidden;text-overflow:ellipsis}aside .workspace .sidebar-company-label select:disabled{cursor:wait;opacity:.65}aside .workspace .sidebar-company-label select:focus-visible{outline:2px solid currentColor;outline-offset:4px}.sidebar-company-label option{background:Canvas;color:CanvasText}`;document.head.append(companySwitcherStyles);renderCompanySwitcher();
