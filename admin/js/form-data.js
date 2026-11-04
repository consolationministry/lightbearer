import { requireAdmin } from "./admin-auth.js?v=33";
import { supabaseRequest } from "./supabase-client.js?v=33";
const esc = encodeURIComponent;
async function admin(path, options) { await requireAdmin(); return supabaseRequest(path, options); }
export async function getForms() { return admin("rest/v1/forms?select=*&deleted_at=is.null&order=updated_at.desc"); }
export async function getForm(id) { const rows = await admin("rest/v1/forms?select=*&id=eq." + esc(id)); return rows?.[0] || null; }
export async function getFields(formId) { return admin("rest/v1/form_fields?select=*&form_id=eq." + esc(formId) + "&order=position.asc"); }
export async function getResponses(formId) { return admin("rest/v1/form_responses?select=*&form_id=eq." + esc(formId) + "&deleted_at=is.null&order=created_at.desc"); }
export async function getFormDashboardCounts() { return admin("rest/v1/rpc/get_form_dashboard_counts", { method: "POST", body: {} }); }
export async function saveForm(form, fields, testers) {
 const normalizedFields = (fields || []).map((field, position) => ({...field, position}));
 const normalizedTesters = (testers || []).slice(0, 20).map(email => String(email).toLowerCase());
 const saved = await admin("rest/v1/rpc/save_admin_form", {method:"POST",body:{p_form:form,p_fields:normalizedFields,p_testers:normalizedTesters}});
 const row = Array.isArray(saved) ? saved[0] : saved;
 if (!row?.id) throw new Error("Form could not be saved.");
 return row;
}
export async function softDeleteForm(id) { const rows=await getResponses(id); if (!rows.length) throw new Error("Download/confirm is required before deletion."); return admin("rest/v1/forms?id=eq."+esc(id),{method:"PATCH",prefer:"return=representation",body:{deleted_at:new Date().toISOString()}}); }
export async function publishForm(id,status) { return admin("rest/v1/forms?id=eq."+esc(id),{method:"PATCH",prefer:"return=representation",body:{status,updated_at:new Date().toISOString()}}); }
export async function getPublicForms() { return supabaseRequest("rest/v1/forms?select=id,title,name,description,expires_at,form_type,registration_config,section_style,form_fields(*)&status=eq.published&deleted_at=is.null&order=created_at.desc",{publicOnly:true}); }
export async function getPublicForm(id) { const rows=await supabaseRequest("rest/v1/forms?select=id,title,name,description,expires_at,form_type,registration_config,section_style,form_fields(*)&id=eq."+esc(id)+"&status=eq.published&deleted_at=is.null",{publicOnly:true}); return rows?.[0]||null; }
export async function saveResponse(payload) { return supabaseRequest("rest/v1/rpc/submit_form_response",{method:"POST",publicOnly:true,body:payload}); }
export async function checkDraft(email,token) { const rows=await supabaseRequest("rest/v1/rpc/authorize_form_tester",{method:"POST",publicOnly:true,body:{p_form_id:token,p_email:email.toLowerCase()}}); return rows===true || rows?.authorized===true; }
export async function getMyResponses(email) { return supabaseRequest("rest/v1/form_responses?select=id,form_id,registration_code,created_at,forms(title,name)&respondent_email=eq."+esc(email.toLowerCase())+"&deleted_at=is.null&order=created_at.desc",{publicOnly:true}); }
