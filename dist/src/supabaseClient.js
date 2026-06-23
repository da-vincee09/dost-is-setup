export const supabaseConfig = {
  url: "https://uupyvkerehgqyrjgovqb.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1cHl2a2VyZWhncXlyamdvdnFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NzkxMjgsImV4cCI6MjA5NzI1NTEyOH0.jqo8H6NWhJP-n1iXBp0Xctlzi2zQm6NUNurpFGNiPEw",
  documentBucket: "documents"
};

const jsonHeaders = {
  apikey: supabaseConfig.anonKey,
  Authorization: `Bearer ${supabaseConfig.anonKey}`,
  "Content-Type": "application/json",
  Prefer: "return=representation"
};

async function request(path, options = {}) {
  const response = await fetch(`${supabaseConfig.url}${path}`, {
    ...options,
    headers: {
      apikey: supabaseConfig.anonKey,
      Authorization: `Bearer ${supabaseConfig.anonKey}`,
      ...options.headers
    }
  });
  if (!response.ok) {
    const message = await response.text();
    if (response.status === 401 || response.status === 403) {
      throw new Error(`${message || `Supabase request failed with ${response.status}`} Check Supabase RLS policies for direct browser writes with the anon key.`);
    }
    throw new Error(message || `Supabase request failed with ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

export const supabaseRest = {
  select(table, query = "select=*") {
    return request(`/rest/v1/${table}?${query}`, { headers: jsonHeaders });
  },
  async selectAll(table, query = "select=*") {
    const pageSize = 1000;
    const rows = [];
    const separator = query ? "&" : "";
    for (let from = 0; ; from += pageSize) {
      const chunk = await request(`/rest/v1/${table}?${query}${separator}limit=${pageSize}&offset=${from}`, { headers: jsonHeaders });
      rows.push(...chunk);
      if (chunk.length < pageSize) return rows;
    }
  },
  upsert(table, rows, onConflict = "id") {
    return request(`/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
      method: "POST",
      headers: { ...jsonHeaders, Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(Array.isArray(rows) ? rows : [rows])
    });
  },
  insert(table, rows) {
    return request(`/rest/v1/${table}`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(Array.isArray(rows) ? rows : [rows])
    });
  },
  patch(table, id, patch) {
    return request(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify(patch)
    });
  },
  deleteWhere(table, column, value) {
    return request(`/rest/v1/${table}?${column}=eq.${encodeURIComponent(value)}`, {
      method: "DELETE",
      headers: { ...jsonHeaders, Prefer: "return=minimal" }
    });
  },
  uploadDocument(path, file) {
    return request(`/storage/v1/object/${supabaseConfig.documentBucket}/${encodeURIComponent(path).replaceAll("%2F", "/")}`, {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "true"
      },
      body: file
    });
  },
  deleteDocument(path) {
    return request(`/storage/v1/object/${supabaseConfig.documentBucket}/${encodeURIComponent(path).replaceAll("%2F", "/")}`, {
      method: "DELETE"
    });
  },
  publicDocumentUrl(path) {
    return `${supabaseConfig.url}/storage/v1/object/public/${supabaseConfig.documentBucket}/${encodeURIComponent(path).replaceAll("%2F", "/")}`;
  }
};
