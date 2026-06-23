import {
  defaultSettings,
  initialAdjustments,
  initialBeneficiaries,
  initialDeferments,
  initialDocuments,
  initialPayments,
  initialReceipts
} from "./referenceData.js";
import {
  patchSupabaseDirect,
  readSupabaseStateDirect,
  removeSupabaseDirect,
  saveSupabaseStateDirect,
  uploadSupabaseDocumentDirect,
  upsertSupabaseDirect
} from "./supabaseState.js";

const initialState = {
  beneficiaries: initialBeneficiaries,
  payments: initialPayments,
  receipts: initialReceipts,
  deferments: initialDeferments,
  adjustments: initialAdjustments,
  documents: initialDocuments,
  settings: defaultSettings,
  activity: []
};

let frontendState = structuredClone(initialState);
let stateVersion = 0;
let backendOnline = false;
let backendInitialized = false;

function clone(value) {
  return structuredClone(value);
}

function normalizeState(state = {}) {
  return {
    beneficiaries: Array.isArray(state.beneficiaries) ? state.beneficiaries : [],
    employees: Array.isArray(state.employees) ? state.employees : [],
    payments: Array.isArray(state.payments) ? state.payments : [],
    receipts: Array.isArray(state.receipts) ? state.receipts : [],
    deferments: Array.isArray(state.deferments) ? state.deferments : [],
    adjustments: Array.isArray(state.adjustments) ? state.adjustments : [],
    documents: Array.isArray(state.documents) ? state.documents : [],
    salesMonitoring: Array.isArray(state.salesMonitoring) ? state.salesMonitoring : [],
    settings: { ...defaultSettings, ...(state.settings || {}) },
    activity: Array.isArray(state.activity) ? state.activity : []
  };
}

function setState(nextState) {
  frontendState = normalizeState(clone(nextState));
  stateVersion += 1;
  return clone(frontendState);
}

async function loadBackendState() {
  return { state: normalizeState(await readSupabaseStateDirect()), online: true };
}

function saveStateRemote(state) {
  return saveSupabaseStateDirect(state);
}

function upsertRemote(collection, record) {
  return upsertSupabaseDirect(collection, record);
}

function patchRemote(collection, id, patch) {
  return patchSupabaseDirect(collection, id, patch);
}

function removeRemote(collection, id) {
  return removeSupabaseDirect(collection, id);
}

function uploadDocumentRemote(record, file) {
  return uploadSupabaseDocumentDirect(record, file).then((storagePath) => ({ storagePath }));
}

function queueBackend(operation) {
  if (!backendOnline) return;
  operation().catch((error) => {
    console.warn("Backend sync failed; continuing with in-memory state:", error);
  });
}

function updateCollection(collection, updater) {
  const records = frontendState[collection] || [];
  frontendState = { ...frontendState, [collection]: updater([...records]) };
  stateVersion += 1;
}

export const repository = {
  async init() {
    const loaded = await loadBackendState();
    frontendState = loaded.state;
    backendOnline = loaded.online;
    backendInitialized = true;
    stateVersion += 1;
    return { online: backendOnline };
  },
  async reload() {
    const loaded = await loadBackendState();
    frontendState = loaded.state;
    backendOnline = loaded.online;
    backendInitialized = true;
    stateVersion += 1;
    return clone(frontendState);
  },
  isOnline() {
    return backendOnline;
  },
  getVersion() {
    return stateVersion;
  },
  getSnapshot() {
    return frontendState;
  },
  getState() {
    return clone(frontendState);
  },
  saveState(nextState) {
    setState(nextState);
    queueBackend(() => saveStateRemote(frontendState));
    return clone(frontendState);
  },
  reset() {
    setState(initialState);
    queueBackend(() => saveStateRemote(frontendState));
    return clone(frontendState);
  },
  list(collection) {
    return clone(frontendState[collection] || []);
  },
  get(collection, id) {
    return clone((frontendState[collection] || []).find((item) => item.id === id) || null);
  },
  upsert(collection, record) {
    updateCollection(collection, (records) => {
      const index = records.findIndex((item) => item.id === record.id);
      if (index >= 0) records[index] = { ...records[index], ...record };
      else records.unshift(record);
      return records;
    });
    queueBackend(() => upsertRemote(collection, record));
    return clone(record);
  },
  async upsertAsync(collection, record) {
    if (!backendOnline && !backendInitialized) return this.upsert(collection, record);
    const previousState = clone(frontendState);
    updateCollection(collection, (records) => {
      const index = records.findIndex((item) => item.id === record.id);
      if (index >= 0) records[index] = { ...records[index], ...record };
      else records.unshift(record);
      return records;
    });
    try {
      const [saved] = await upsertRemote(collection, record);
      if (saved) {
        updateCollection(collection, (records) => records.map((item) => (item.id === record.id || item.id === saved.id ? saved : item)));
        return clone(saved);
      }
      return clone(record);
    } catch (error) {
      frontendState = previousState;
      stateVersion += 1;
      throw error;
    }
  },
  async bulkUpsert(collection, records) {
    updateCollection(collection, (existing) => {
      const nextRecords = [...existing];
      records.forEach((record) => {
        const index = nextRecords.findIndex((item) => item.id === record.id);
        if (index >= 0) nextRecords[index] = { ...nextRecords[index], ...record };
        else nextRecords.unshift(record);
      });
      return nextRecords;
    });
    if (backendOnline) await upsertRemote(collection, records);
    return clone(records);
  },
  patch(collection, id, patch) {
    let updated = null;
    updateCollection(collection, (records) => {
      const index = records.findIndex((item) => item.id === id);
      if (index === -1) return records;
      records[index] = { ...records[index], ...patch };
      updated = records[index];
      return records;
    });
    if (updated) queueBackend(() => patchRemote(collection, id, patch));
    return clone(updated);
  },
  async patchAsync(collection, id, patch) {
    const previousState = clone(frontendState);
    let updated = null;
    updateCollection(collection, (records) => {
      const index = records.findIndex((item) => item.id === id);
      if (index === -1) return records;
      records[index] = { ...records[index], ...patch };
      updated = records[index];
      return records;
    });
    if (!updated) return null;
    if (!backendOnline && !backendInitialized) return clone(updated);
    try {
      const saved = await patchRemote(collection, id, patch);
      if (saved) {
        updateCollection(collection, (records) => records.map((item) => (item.id === saved.id ? saved : item)));
        return clone(saved);
      }
      return clone(updated);
    } catch (error) {
      frontendState = previousState;
      stateVersion += 1;
      throw error;
    }
  },
  remove(collection, id) {
    const records = frontendState[collection] || [];
    const record = records.find((item) => item.id === id) || null;
    if (!record) return null;

    if (collection === "beneficiaries") {
      frontendState = {
        ...frontendState,
        beneficiaries: frontendState.beneficiaries.filter((item) => item.id !== id),
        payments: frontendState.payments.filter((item) => item.beneficiaryId !== id),
        receipts: frontendState.receipts.filter((item) => item.beneficiaryId !== id),
        deferments: frontendState.deferments.filter((item) => item.beneficiaryId !== id),
        adjustments: frontendState.adjustments.filter((item) => item.beneficiaryId !== id),
        documents: frontendState.documents.filter((item) => item.beneficiaryId !== id),
        activity: frontendState.activity.filter((item) => item.beneficiaryId !== id)
      };
    } else if (collection === "payments") {
      frontendState = {
        ...frontendState,
        payments: frontendState.payments.filter((item) => item.id !== id),
        receipts: frontendState.receipts.filter((item) => item.paymentId !== id)
      };
    } else {
      frontendState = { ...frontendState, [collection]: records.filter((item) => item.id !== id) };
    }

    stateVersion += 1;
    queueBackend(() => removeRemote(collection, id));
    return clone(record);
  },
  addActivity(entry) {
    frontendState.activity.unshift(entry);
    stateVersion += 1;
    queueBackend(() => upsertRemote("activity", entry));
  },
  async uploadDocumentFile(record, file) {
    if (!file) return "";
    if (!backendOnline) return "";
    const uploaded = await uploadDocumentRemote(record, file);
    return uploaded.storagePath || "";
  }
};
