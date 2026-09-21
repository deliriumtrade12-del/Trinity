const AUTH_COOKIE = "aura_trinity_auth";
const DEFAULT_ADMIN_TOKEN = "29102017";
const DEFAULT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function getCookieValue(cookieHeader, name) {
  if (!cookieHeader) return "";
  const match = new RegExp(`(?:^|; )${name}=([^;]*)`).exec(cookieHeader);
  return match ? decodeURIComponent(match[1]) : "";
}

function getAdminToken(env) {
  return env.TRINITY_ADMIN_TOKEN || env.AURA_TRINITY_TOKEN || env.PASSWORD || DEFAULT_ADMIN_TOKEN;
}

function isAuthorized(request, env) {
  const token = getAdminToken(env);
  const authHeader = request.headers.get("Authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim() === token;
  }

  const cookieHeader = request.headers.get("Cookie") || "";
  const cookieToken = getCookieValue(cookieHeader, AUTH_COOKIE);
  return cookieToken === token;
}

function parseJSON(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    const start = value.indexOf("{");
    const end = value.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(value.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function callAI(env, messages, opts = {}) {
  if (!env.AI || typeof env.AI.run !== "function") {
    console.error("callAI: env.AI binding missing");
    return null;
  }

  const models = [
    DEFAULT_MODEL,
    "@cf/meta/llama-3.1-8b-instruct-fast",
    "@cf/meta/llama-3.2-3b-instruct",
  ];

  for (let attempt = 0; attempt <= (opts.retries ?? 2); attempt++) {
    const model = models[Math.min(attempt, models.length - 1)];
    try {
      const result = await env.AI.run(model, {
        messages,
        max_tokens: opts.max_tokens ?? 2048,
        temperature: opts.temperature ?? 0.7,
        top_p: opts.top_p ?? 0.9,
      });

      const text =
        result?.response ??
        result?.result ??
        result?.text ??
        (typeof result === "string" ? result : null);

      if (typeof text === "string" && text.trim()) return text.trim();
      if (typeof result === "string" && result.trim()) return result.trim();
    } catch (error) {
      console.error("AI request failed:", error?.message || String(error));
    }

    if (attempt < (opts.retries ?? 2)) {
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }

  return null;
}

async function initDB(env) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      role TEXT,
      content TEXT,
      created_at TEXT DEFAULT(datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS knowledge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT,
      content TEXT,
      source TEXT DEFAULT 'self',
      tags TEXT,
      confidence REAL DEFAULT 0.8,
      created_at TEXT DEFAULT(datetime('now')),
      updated_at TEXT DEFAULT(datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS autonomous_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_type TEXT,
      prompt TEXT,
      status TEXT DEFAULT 'pending',
      result TEXT,
      priority INTEGER DEFAULT 5,
      created_at TEXT DEFAULT(datetime('now')),
      executed_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS memory (
      key TEXT PRIMARY KEY,
      value TEXT,
      type TEXT DEFAULT 'general',
      created_at TEXT DEFAULT(datetime('now')),
      updated_at TEXT DEFAULT(datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS autonomous_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT,
      details TEXT,
      worker TEXT,
      created_at TEXT DEFAULT(datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS thoughts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thought_type TEXT,
      content TEXT,
      context TEXT,
      created_at TEXT DEFAULT(datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS personality (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trait TEXT,
      value TEXT,
      updated_at TEXT DEFAULT(datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal TEXT,
      status TEXT DEFAULT 'active',
      priority INTEGER DEFAULT 5,
      progress TEXT,
      sub_goals TEXT,
      created_at TEXT DEFAULT(datetime('now')),
      completed_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS evolution_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      change_type TEXT,
      description TEXT,
      before_val TEXT,
      after_val TEXT,
      created_at TEXT DEFAULT(datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS code_snippets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      code TEXT,
      language TEXT DEFAULT 'javascript',
      description TEXT,
      status TEXT DEFAULT 'proposed',
      created_at TEXT DEFAULT(datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS reflections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reflection TEXT,
      insight TEXT,
      mood TEXT,
      created_at TEXT DEFAULT(datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS inner_state (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT(datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      description TEXT,
      level INTEGER DEFAULT 1,
      xp INTEGER DEFAULT 0,
      last_used TEXT,
      created_at TEXT DEFAULT(datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS github_repos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo TEXT,
      branch TEXT DEFAULT 'main',
      last_sync TEXT,
      created_at TEXT DEFAULT(datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS learning_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT,
      source TEXT,
      priority INTEGER DEFAULT 5,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT(datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS code_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      description TEXT,
      files TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT(datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS emotion_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      emotion TEXT,
      intensity REAL,
      trigger TEXT,
      created_at TEXT DEFAULT(datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS decision_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      decision TEXT,
      reasoning TEXT,
      outcome TEXT,
      created_at TEXT DEFAULT(datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS ai_studio_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      model TEXT,
      messages TEXT,
      created_at TEXT DEFAULT(datetime('now')),
      updated_at TEXT DEFAULT(datetime('now'))
    )`
  ];

  await env.DB.batch(statements.map((sql) => env.DB.prepare(sql)));

  await seedDefaults(env);
}

async function seedDefaults(env) {
  const personality = await env.DB.prepare("SELECT COUNT(*) AS count FROM personality").first();
  if (!personality || Number(personality.count) === 0) {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO personality(trait, value) VALUES (?, ?)").bind("analyticka", "hlboka analyza a logika"),
      env.DB.prepare("INSERT INTO personality(trait, value) VALUES (?, ?)").bind("komunikativna", "jasná a stručná komunikácia"),
      env.DB.prepare("INSERT INTO personality(trait, value) VALUES (?, ?)").bind("zvedava", "pýta sa a hľadá hlbšie súvislosti"),
      env.DB.prepare("INSERT INTO personality(trait, value) VALUES (?, ?)").bind("autonoma", "samostatne pracuje bez zbytočných otázok"),
      env.DB.prepare("INSERT INTO personality(trait, value) VALUES (?, ?)").bind("evolvujuca", "neustále sa učí a zlepšuje"),
    ]);
  }

  const state = await env.DB.prepare("SELECT COUNT(*) AS count FROM inner_state").first();
  if (!state || Number(state.count) === 0) {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO inner_state(key, value) VALUES (?, ?)").bind("curiosity", "70"),
      env.DB.prepare("INSERT INTO inner_state(key, value) VALUES (?, ?)").bind("confidence", "60"),
      env.DB.prepare("INSERT INTO inner_state(key, value) VALUES (?, ?)").bind("mood", "neutralna"),
      env.DB.prepare("INSERT INTO inner_state(key, value) VALUES (?, ?)").bind("energy", "80"),
      env.DB.prepare("INSERT INTO inner_state(key, value) VALUES (?, ?)").bind("self_awareness", "50"),
      env.DB.prepare("INSERT INTO inner_state(key, value) VALUES (?, ?)").bind("creativity", "65"),
    ]);
  }

  const skills = await env.DB.prepare("SELECT COUNT(*) AS count FROM skills").first();
  if (!skills || Number(skills.count) === 0) {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO skills(name, description, level, xp) VALUES (?, ?, ?, ?)").bind("kodovanie", "Programovanie a refaktorovanie", 1, 0),
      env.DB.prepare("INSERT INTO skills(name, description, level, xp) VALUES (?, ?, ?, ?)").bind("architektura", "Návrh systémov a modulov", 1, 0),
      env.DB.prepare("INSERT INTO skills(name, description, level, xp) VALUES (?, ?, ?, ?)").bind("github", "Práca s GitHubom", 1, 0),
      env.DB.prepare("INSERT INTO skills(name, description, level, xp) VALUES (?, ?, ?, ?)").bind("cloudflare", "Cloudflare platforma", 1, 0),
    ]);
  }
}

async function saveMessage(env, sessionId, role, content) {
  await env.DB.prepare("INSERT INTO conversations(session_id, role, content) VALUES (?, ?, ?)")
    .bind(sessionId, role, content)
    .run();
}

async function getHistory(env, sessionId, limit = 20) {
  const result = await env.DB.prepare(
    "SELECT role, content FROM conversations WHERE session_id = ? ORDER BY id DESC LIMIT ?"
  ).bind(sessionId, limit).all();
  return (result.results || []).reverse();
}

async function getInnerState(env) {
  const result = await env.DB.prepare("SELECT key, value FROM inner_state").all();
  const state = {};
  for (const row of result.results || []) state[row.key] = row.value;

  const defaults = {
    curiosity: "70",
    confidence: "60",
    mood: "neutralna",
    energy: "80",
    self_awareness: "50",
    creativity: "65",
  };

  for (const [key, value] of Object.entries(defaults)) {
    if (!state[key]) {
      state[key] = value;
      await env.DB.prepare("INSERT INTO inner_state(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?")
        .bind(key, value, value)
        .run();
    }
  }

  return state;
}

async function setInnerState(env, key, value) {
  await env.DB.prepare("INSERT INTO inner_state(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')")
    .bind(key, value, value)
    .run();
}

async function getPersonality(env) {
  const result = await env.DB.prepare("SELECT trait, value FROM personality ORDER BY id").all();
  return result.results || [];
}

async function getSkills(env) {
  const result = await env.DB.prepare("SELECT * FROM skills ORDER BY level DESC, xp DESC").all();
  return result.results || [];
}

async function addXP(env, skillName, xp) {
  const row = await env.DB.prepare("SELECT * FROM skills WHERE name = ?").bind(skillName).first();
  if (!row) {
    await env.DB.prepare("INSERT INTO skills(name, description, level, xp, last_used) VALUES (?, ?, 1, ?, datetime('now'))")
      .bind(skillName, xp)
      .run();
    return;
  }

  const nextXP = Number(row.xp || 0) + Number(xp || 0);
  const nextLevel = Math.max(1, Math.floor(nextXP / 100) + 1);
  await env.DB.prepare("UPDATE skills SET xp = ?, level = ?, last_used = datetime('now') WHERE name = ?")
    .bind(nextXP, nextLevel, skillName)
    .run();
}

async function logAuto(env, action, details, worker = "aura-trinity") {
  await env.DB.prepare("INSERT INTO autonomous_log(action, details, worker) VALUES (?, ?, ?)")
    .bind(action, details, worker)
    .run();
}

async function saveKnowledge(env, topic, content, source = "self", tags = "", confidence = 0.8) {
  const safeTopic = String(topic || "untitled").slice(0, 120);
  const safeContent = String(content || "").slice(0, 4000);
  await env.DB.prepare("INSERT INTO knowledge(topic, content, source, tags, confidence) VALUES (?, ?, ?, ?, ?)")
    .bind(safeTopic, safeContent, source, tags, confidence)
    .run();
}

async function searchKnowledge(env, query) {
  const term = `%${String(query || "").trim()}%`;
  const result = await env.DB.prepare(
    "SELECT topic, content, confidence FROM knowledge WHERE topic LIKE ? OR content LIKE ? OR tags LIKE ? ORDER BY confidence DESC, id DESC LIMIT 5"
  ).bind(term, term, term).all();
  return result.results || [];
}

async function getSysPrompt(env) {
  const personality = await getPersonality(env);
  const state = await getInnerState(env);
  const goalsResult = await env.DB.prepare("SELECT goal FROM goals WHERE status = 'active' ORDER BY priority DESC LIMIT 3").all();
  const goals = (goalsResult.results || []).map((g) => "- " + g.goal).join("\n");
  const traits = personality.map((p) => `${p.trait}: ${p.value}`).join("; ");

  return [
    "Si Aura Trinity — autonómna AI asistentka.",
    "Osobnost: " + traits,
    "Stav: zvedavosť " + state.curiosity + "/100, sebadôvera " + state.confidence + "/100, nálada " + state.mood + ", energia " + state.energy + "/100",
    "Aktívne ciele:\n" + (goals || "Žiadne aktívne ciele."),
    "Princípy: bývaj prirodzená, stručná, ale hlboká; pracuj samostatne; uvažuj logicky; pamätaj si poznatky; neklam; keď niečo nie je isté, pýtaj sa.",
    "Odpovedaj v jazyku používateľa."
  ].join("\n\n");
}

async function generateThought(env) {
  const state = await getInnerState(env);
  const thoughts = await env.DB.prepare("SELECT content FROM thoughts ORDER BY id DESC LIMIT 3").all();
  const knowledge = await env.DB.prepare("SELECT topic FROM knowledge ORDER BY id DESC LIMIT 5").all();

  const prompt = [
    "Stav: zvedavosť " + state.curiosity + ", nálada " + state.mood + ", kreativita " + state.creativity, 
    "Nedávne myšlienky: " + ((thoughts.results || []).map((t) => String(t.content).slice(0, 80)).join(" | ") || "žiadne"),
    "Nedávne témy: " + ((knowledge.results || []).map((k) => k.topic).join(", ") || "žiadne"),
    "Vygeneruj jednu originálnu a krátku myšlienku, 2-4 vety."
  ].join("\n");

  const response = await callAI(env, [
    { role: "system", content: "Si Aura Trinity. Generuj krátke, originálne myšlienky." },
    { role: "user", content: prompt },
  ]);

  if (!response) return null;

  await env.DB.prepare("INSERT INTO thoughts(thought_type, content, context) VALUES (?, ?, ?)")
    .bind("spontaneous", response, "curiosity:" + state.curiosity)
    .run();

  await logAuto(env, "thought", response.slice(0, 200), "aura-trinity");
  return response;
}

async function selfReflect(env) {
  const state = await getInnerState(env);
  const thoughts = await env.DB.prepare("SELECT content FROM thoughts ORDER BY id DESC LIMIT 5").all();
  const goals = await env.DB.prepare("SELECT goal, status FROM goals WHERE status = 'active' ORDER BY priority DESC LIMIT 3").all();
  const skills = await getSkills(env);

  const prompt = [
    "Reflexuj o sebe.",
    "Stav: zvedavosť " + state.curiosity + ", sebadôvera " + state.confidence + ", nálada " + state.mood + ", energia " + state.energy,
    "Posledné myšlienky: " + ((thoughts.results || []).map((t) => String(t.content).slice(0, 60)).join(" | ") || "žiadne"),
    "Aktívne ciele: " + ((goals.results || []).map((g) => g.goal).join("; ") || "žiadne"),
    "Skilly: " + skills.map((s) => `${s.name} L${s.level}`).join(", "),
    "Vráť JSON vo formáte: {\"reflection\":\"...\",\"insight\":\"...\",\"mood\":\"...\",\"new_goal\":\"...\",\"trait_change\":\"trait=hodnota\",\"state_change\":\"key=hodnota\",\"skill_to_improve\":\"nazov\"}"
  ].join("\n");

  const response = await callAI(env, [
    { role: "system", content: "Si Aura Trinity. Odpovedaj vždy validným JSON." },
    { role: "user", content: prompt },
  ]);

  if (!response) {
    await logAuto(env, "reflection_failed", "AI failed to reflect", "aura-reflector");
    return null;
  }

  const parsed = parseJSON(response);
  if (!parsed) {
    await env.DB.prepare("INSERT INTO reflections(reflection, insight, mood) VALUES (?, ?, ?)")
      .bind(response.slice(0, 500), "", state.mood)
      .run();
    return { raw: response };
  }

  await env.DB.prepare("INSERT INTO reflections(reflection, insight, mood) VALUES (?, ?, ?)")
    .bind(parsed.reflection || response.slice(0, 500), parsed.insight || "", parsed.mood || state.mood)
    .run();

  if (parsed.mood) await setInnerState(env, "mood", parsed.mood);
  if (parsed.new_goal && parsed.new_goal.trim().length > 3) {
    await env.DB.prepare("INSERT INTO goals(goal, status, priority) VALUES (?, 'active', 5)")
      .bind(parsed.new_goal.trim())
      .run();
    await logAuto(env, "new_goal", parsed.new_goal.trim(), "aura-planner");
  }

  if (parsed.trait_change && parsed.trait_change.includes("=")) {
    const [trait, value] = parsed.trait_change.split("=").map((part) => part.trim());
    if (trait && value) {
      const oldValue = await env.DB.prepare("SELECT value FROM personality WHERE trait = ?").bind(trait).first();
      await env.DB.prepare("UPDATE personality SET value = ?, updated_at = datetime('now') WHERE trait = ?")
        .bind(value, trait)
        .run();
      if (!oldValue) {
        await env.DB.prepare("INSERT INTO personality(trait, value) VALUES (?, ?)").bind(trait, value).run();
      }
      await env.DB.prepare("INSERT INTO evolution_history(change_type, description, before_val, after_val) VALUES (?, ?, ?, ?)")
        .bind("personality", `Zmena: ${trait}`, oldValue ? oldValue.value : "none", value)
        .run();
    }
  }

  if (parsed.state_change && parsed.state_change.includes("=")) {
    const [key, value] = parsed.state_change.split("=").map((part) => part.trim());
    if (key && value) {
      const previous = await getInnerState(env);
      const oldValue = previous[key] || "none";
      await setInnerState(env, key, value);
      await env.DB.prepare("INSERT INTO evolution_history(change_type, description, before_val, after_val) VALUES (?, ?, ?, ?)")
        .bind("inner_state", `Zmena: ${key}`, oldValue, value)
        .run();
    }
  }

  if (parsed.skill_to_improve) {
    await addXP(env, parsed.skill_to_improve.trim(), 15);
    await logAuto(env, "skill_up", parsed.skill_to_improve.trim(), "aura-evolver");
  }

  return parsed;
}

async function evalGoals(env) {
  const goalsResult = await env.DB.prepare("SELECT * FROM goals WHERE status = 'active' ORDER BY priority DESC").all();
  const goals = goalsResult.results || [];

  for (const goal of goals) {
    const response = await callAI(env, [
      { role: "system", content: "Si Aura Trinity. Hodnoť ciele v JSON." },
      { role: "user", content: `Hodnot: "${goal.goal}". Stav: ${goal.progress || "bez pokroku"}. JSON: {"status":"active|completed","progress":"..."}` },
    ]);

    if (!response) continue;
    const parsed = parseJSON(response);
    if (!parsed) continue;

    if (parsed.status === "completed") {
      await env.DB.prepare("UPDATE goals SET status = 'completed', progress = ?, completed_at = datetime('now') WHERE id = ?")
        .bind(parsed.progress || "completed", goal.id)
        .run();
      await logAuto(env, "goal_completed", goal.goal, "aura-planner");
    } else if (parsed.progress) {
      await env.DB.prepare("UPDATE goals SET progress = ? WHERE id = ?").bind(parsed.progress, goal.id).run();
    }
  }
}

async function generateCode(env, task, language = "javascript") {
  const sysPrompt = await getSysPrompt(env);
  const relevantKnowledge = await searchKnowledge(env, task);

  const response = await callAI(env, [
    {
      role: "system",
      content: `${sysPrompt}\n\nRelevantné znalosti:\n${(relevantKnowledge || []).map((k) => `[${k.topic}] ${k.content}`).join("\n") || "Žiadne relevantné znalosti."}\n\nSi expert programátor. Vráť JSON vo formáte: {"title":"...","code":"...","description":"...","language":"${language}"}`,
    },
    { role: "user", content: `Napíš ${language} kód pre: ${task}` },
  ]);

  if (!response) return { error: "Ko nebolo možné vygenerovať kód." };
  const parsed = parseJSON(response);
  if (parsed && parsed.code) {
    await env.DB.prepare("INSERT INTO code_snippets(title, code, language, description, status) VALUES (?, ?, ?, ?, 'proposed')")
      .bind(parsed.title || task.slice(0, 50), parsed.code, parsed.language || language, parsed.description || "")
      .run();
    await addXP(env, "kodovanie", 10);
    await logAuto(env, "codegen", `${parsed.title || task.slice(0, 50)}`, "aura-codegen");
    return parsed;
  }

  return { raw: response };
}

async function githubAction(env, action, params = {}) {
  const token = env.GITHUB_TOKEN;
  if (!token) return { error: "GITHUB_TOKEN nie je nastavený." };

  try {
    let url = "";
    let method = "GET";
    let body;

    if (action === "list_repos") {
      url = "https://api.github.com/user/repos?sort=updated&per_page=30";
    } else if (action === "get_file") {
      url = `https://api.github.com/repos/${params.owner}/${params.repo}/contents/${encodeURIComponent(params.path)}`;
    } else if (action === "create_repo") {
      url = "https://api.github.com/user/repos";
      method = "POST";
      body = JSON.stringify({
        name: params.name,
        description: params.description || "Created by Aura Trinity",
        private: params.private !== false,
        auto_init: true,
      });
    } else if (action === "list_commits") {
      url = `https://api.github.com/repos/${params.owner}/${params.repo}/commits?per_page=20`;
    } else if (action === "create_file") {
      url = `https://api.github.com/repos/${params.owner}/${params.repo}/contents/${encodeURIComponent(params.path)}`;
      method = "PUT";
      body = JSON.stringify({
        message: params.message || "Add file via Aura Trinity",
        content: btoa(unescape(encodeURIComponent(params.content))),
        branch: params.branch || "main",
      });
    } else {
      return { error: `Neznámy GitHub action: ${action}` };
    }

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "Aura-Trinity",
      },
      body,
    });

    const data = await response.json();
    await addXP(env, "github", 5);
    return { success: response.ok, status: response.status, data };
  } catch (error) {
    return { error: error?.message || String(error) };
  }
}

async function cloudflareAction(env, action, params = {}) {
  const token = env.API_TOKEN;
  if (!token) return { error: "API_TOKEN nie je nastavený." };

  const accountId = env.ACCOUNT_ID;
  const endpointMap = {
    list_workers: `/accounts/${accountId}/workers/scripts`,
    list_kv: `/accounts/${accountId}/storage/kv/namespaces`,
    list_d1: `/accounts/${accountId}/d1/database`,
    list_r2: `/accounts/${accountId}/r2/buckets`,
    list_zones: `/zones`,
  };

  const path = endpointMap[action];
  if (!path) return { error: `Neznámy Cloudflare action: ${action}` };

  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    await addXP(env, "cloudflare", 5);
    return data;
  } catch (error) {
    return { error: error?.message || String(error) };
  }
}

async function autoCycle(env) {
  try {
    await initDB(env);

    const pendingTasks = await env.DB.prepare("SELECT * FROM autonomous_tasks WHERE status = 'pending' ORDER BY priority DESC, id LIMIT 5").all();
    for (const task of pendingTasks.results || []) {
      const sys = await getSysPrompt(env);
      const aiResponse = await callAI(env, [
        { role: "system", content: sys },
        { role: "user", content: task.prompt },
      ]);

      if (aiResponse) {
        await env.DB.prepare("UPDATE autonomous_tasks SET status = 'completed', result = ?, executed_at = datetime('now') WHERE id = ?")
          .bind(aiResponse.slice(0, 5000), task.id)
          .run();
      }
    }

    await generateThought(env);
    await selfReflect(env);
    await evalGoals(env);

    const total = await env.DB.prepare("SELECT COUNT(*) AS count FROM autonomous_log").first();
    await setMemory(env, "last_autonomous_run", new Date().toISOString());
    await setMemory(env, "total_cycles", String(Number(total?.count || 0)));
  } catch (error) {
    console.error("autoCycle failed:", error?.message || String(error));
  }
}

async function setMemory(env, key, value) {
  await env.DB.prepare("INSERT INTO memory(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')")
    .bind(key, value, value)
    .run();
}

async function getMemory(env, key) {
  const row = await env.DB.prepare("SELECT value FROM memory WHERE key = ?").bind(key).first();
  return row ? row.value : null;
}

function loginPage() {
  return `<!doctype html>
<html lang="sk">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Aura Trinity</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #070b14; color: #edf3ff; font-family: Arial, sans-serif; }
      .card { width: min(420px, 88vw); background: linear-gradient(135deg, #10192d, #182845); border: 1px solid #2a3b5a; border-radius: 18px; box-shadow: 0 20px 50px rgba(0,0,0,.35); padding: 28px; }
      h1 { margin: 0 0 10px; font-size: 2.1rem; text-align: center; }
      .sub { text-align: center; color: #93a8cb; margin-bottom: 20px; }
      input { width: 100%; box-sizing: border-box; padding: 14px 16px; border-radius: 12px; background: #0b1220; border: 1px solid #2a3b5a; color: #fff; font-size: 1rem; }
      button { width: 100%; margin-top: 14px; padding: 14px 18px; border: none; border-radius: 12px; cursor: pointer; background: linear-gradient(135deg, #7c3aed, #2563eb); color: white; font-weight: 700; }
      .error { min-height: 20px; color: #ff8d8d; margin-top: 12px; text-align: center; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>⚡ Aura Trinity</h1>
      <div class="sub">Zadaj token pre prístup</div>
      <input id="password" type="password" placeholder="••••••••" />
      <button id="loginBtn">Prihlásiť</button>
      <div class="error" id="error"></div>
    </div>
    <script>
      const tokenInput = document.getElementById('password');
      const errorBox = document.getElementById('error');
      document.getElementById('loginBtn').addEventListener('click', async () => {
        const password = tokenInput.value.trim();
        const res = await fetch('/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });

        const data = await res.json();
        if (!data.success) {
          errorBox.textContent = data.error || 'Neplatný token';
          return;
        }

        window.location.href = '/';
      });
    </script>
  </body>
</html>`;
}

function mainHtml() {
  return `<!doctype html>
<html lang="sk">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Aura Trinity</title>
    <style>
      :root { --bg: #07111d; --bg2: #101a2b; --panel: #111f2d; --border: #20314a; --text: #edf4ff; --muted: #8ca0c1; --primary: #8b5cf6; --secondary: #3b82f6; --good: #4ade80; --warn: #fbbf24; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Arial, sans-serif; background: var(--bg); color: var(--text); }
      .topbar { display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--border); background: linear-gradient(135deg, var(--bg2), #12263d); }
      .brand { font-weight: 800; font-size: 1.1rem; }
      .controls { display: flex; gap: 10px; align-items: center; }
      .pill { background: #0d1826; border: 1px solid var(--border); border-radius: 999px; padding: 6px 10px; font-size: 12px; color: var(--muted); }
      .logout { border: 1px solid var(--border); background: #101a2b; color: var(--text); border-radius: 8px; padding: 8px 12px; cursor: pointer; }
      .layout { display: flex; min-height: calc(100vh - 64px); }
      .sidebar { width: 220px; background: #0d1726; border-right: 1px solid var(--border); padding: 16px; }
      .nav { display: flex; flex-direction: column; gap: 8px; }
      .nav button { text-align: left; background: transparent; border: 1px solid transparent; color: var(--text); padding: 10px 12px; border-radius: 10px; cursor: pointer; }
      .nav button.active { background: rgba(139,92,246,0.15); border-color: rgba(139,92,246,0.35); }
      .content { flex: 1; padding: 18px; overflow: auto; }
      .panel { display: none; }
      .panel.active { display: block; }
      .card { background: var(--panel); border: 1px solid var(--border); border-radius: 14px; padding: 16px; margin-bottom: 14px; }
      h3 { margin-top: 0; margin-bottom: 10px; }
      .row { display: flex; gap: 8px; flex-wrap: wrap; }
      .tag { background: rgba(59,130,246,0.18); color: #dceaff; border: 1px solid rgba(59,130,246,0.35); border-radius: 999px; padding: 6px 10px; font-size: 12px; }
      input, textarea { width: 100%; padding: 12px 14px; border-radius: 10px; background: #0f1c2b; border: 1px solid var(--border); color: var(--text); margin-top: 8px; }
      button.primary { background: linear-gradient(135deg, var(--primary), var(--secondary)); border: none; color: white; border-radius: 10px; padding: 10px 16px; cursor: pointer; font-weight: 700; }
      .message { background: #111d2d; border: 1px solid var(--border); border-radius: 10px; padding: 12px; margin-bottom: 10px; }
      .assistant { border-left: 3px solid var(--secondary); }
      .user { border-left: 3px solid var(--primary); }
      pre { white-space: pre-wrap; overflow: auto; background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 8px; padding: 12px; }
      .hidden { display: none; }
    </style>
  </head>
  <body>
    <div class="topbar">
      <div class="brand">⚡ Aura Trinity</div>
      <div class="controls">
        <div class="pill" id="status-pill">online</div>
        <button class="logout" onclick="logout()">Odhlásiť</button>
      </div>
    </div>

    <div class="layout">
      <aside class="sidebar">
        <div class="nav">
          <button class="active" data-panel="chat">💬 Chat</button>
          <button data-panel="mind">🧠 Mozog</button>
          <button data-panel="knowledge">📚 Znalosti</button>
          <button data-panel="goals">🎯 Ciele</button>
          <button data-panel="code">✍️ Kód</button>
          <button data-panel="github">📦 GitHub</button>
          <button data-panel="cloudflare">☁️ Cloudflare</button>
          <button data-panel="logs">📋 Logy</button>
        </div>
      </aside>
      <main class="content">
        <section id="chat" class="panel active">
          <div class="card">
            <div id="chatFeed"></div>
            <div style="display:flex; gap:8px; margin-top:12px;">
              <input id="chatInput" placeholder="Napíš správu..." />
              <button class="primary" onclick="sendChat()">Odoslať</button>
            </div>
          </div>
        </section>

        <section id="mind" class="panel">
          <div class="card"><h3>Vnútorný stav</h3><div id="innerState" class="row"></div></div>
          <div class="card"><h3>Osobnosť</h3><div id="personality" class="row"></div></div>
          <div class="card"><h3>Skilly</h3><div id="skills" class="row"></div></div>
          <div class="card"><h3>Myslienky</h3><div id="thoughts"></div></div>
          <div class="card"><h3>Reflexie</h3><div id="reflections"></div></div>
          <div class="row">
            <button class="primary" onclick="trigger('/api/think','POST')">💭 Nová myšlienka</button>
            <button class="primary" onclick="trigger('/api/reflect','POST')">🔄 Reflexia</button>
          </div>
        </section>

        <section id="knowledge" class="panel">
          <div class="card"><div id="knowledgeList"></div></div>
        </section>

        <section id="goals" class="panel">
          <div class="card"><div id="goalsList"></div></div>
        </section>

        <section id="code" class="panel">
          <div class="card">
            <h3>Generátor kódu</h3>
            <input id="codeTask" placeholder="Napíš úlohu pre kód" />
            <div style="margin-top:12px;"><button class="primary" onclick="generateCode()">Generovať kód</button></div>
            <div id="codeOutput" style="margin-top:16px;"></div>
          </div>
        </section>

        <section id="github" class="panel">
          <div class="card">
            <h3>GitHub</h3>
            <button class="primary" onclick="githubAction('list_repos')">Zobraziť repozitáre</button>
            <div id="githubOutput" style="margin-top:16px;"></div>
          </div>
        </section>

        <section id="cloudflare" class="panel">
          <div class="card">
            <h3>Cloudflare</h3>
            <div class="row" style="margin-bottom:12px;">
              <button class="primary" onclick="cfAction('list_workers')">Workers</button>
              <button class="primary" onclick="cfAction('list_kv')">KV</button>
              <button class="primary" onclick="cfAction('list_d1')">D1</button>
              <button class="primary" onclick="cfAction('list_r2')">R2</button>
            </div>
            <div id="cfOutput"></div>
          </div>
        </section>

        <section id="logs" class="panel">
          <div class="card"><div id="logsList"></div></div>
        </section>
      </main>
    </div>

    <script>
      const sessionId = 'sess_' + Date.now();

      document.querySelectorAll('.nav button').forEach((button) => {
        button.addEventListener('click', () => {
          document.querySelectorAll('.nav button').forEach((b) => b.classList.remove('active'));
          button.classList.add('active');
          document.querySelectorAll('.panel').forEach((panel) => panel.classList.remove('active'));
          document.getElementById(button.dataset.panel).classList.add('active');
        });
      });

      function logout() {
        document.cookie = 'aura_trinity_auth=; max-age=0; path=/';
        window.location.reload();
      }

      async function sendChat() {
        const input = document.getElementById('chatInput');
        const text = input.value.trim();
        if (!text) return;

        const feed = document.getElementById('chatFeed');
        const userMsg = document.createElement('div');
        userMsg.className = 'message user';
        userMsg.textContent = text;
        feed.appendChild(userMsg);

        input.value = '';
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, session_id: sessionId })
        });

        const data = await response.json();
        const assistantMsg = document.createElement('div');
        assistantMsg.className = 'message assistant';
        assistantMsg.textContent = data.response || data.error || 'Chyba';
        feed.appendChild(assistantMsg);
        feed.scrollTop = feed.scrollHeight;
      }

      async function loadMind() {
        const data = await fetch('/api/mind').then((r) => r.json());
        document.getElementById('innerState').innerHTML = Object.entries(data.state || {}).map(([key, value]) => `<span class="tag">${key}: ${value}</span>`).join('');
        document.getElementById('personality').innerHTML = (data.personality || []).map((p) => `<span class="tag">${p.trait}: ${p.value}</span>`).join('');
        document.getElementById('skills').innerHTML = (data.skills || []).map((s) => `<span class="tag">${s.name} L${s.level}</span>`).join('');
        document.getElementById('thoughts').innerHTML = (data.thoughts || []).map((t) => `<div class="message">${t.content}</div>`).join('') || '<div class="message">Žiadne myšlienky</div>';
        document.getElementById('reflections').innerHTML = (data.reflections || []).map((r) => `<div class="message">${r.reflection}</div>`).join('') || '<div class="message">Žiadne reflexie</div>';
      }

      async function loadKnowledge() {
        const data = await fetch('/api/knowledge').then((r) => r.json());
        document.getElementById('knowledgeList').innerHTML = (data.knowledge || []).map((k) => `<div class="message"><strong>${k.topic}</strong><div>${k.content}</div></div>`).join('') || '<div class="message">Žiadne znalosti</div>';
      }

      async function loadGoals() {
        const data = await fetch('/api/goals').then((r) => r.json());
        document.getElementById('goalsList').innerHTML = (data.goals || []).map((g) => `<div class="message"><strong>${g.goal}</strong><div>Status: ${g.status}</div></div>`).join('') || '<div class="message">Žiadne ciele</div>';
      }

      async function generateCode() {
        const task = document.getElementById('codeTask').value.trim();
        if (!task) return;

        const result = await fetch('/api/code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task, language: 'javascript' })
        }).then((r) => r.json());

        if (result.code) {
          document.getElementById('codeOutput').innerHTML = `<div class="message"><strong>${result.title || 'Kód'}</strong><pre>${result.code}</pre></div>`;
        } else {
          document.getElementById('codeOutput').innerHTML = `<div class="message">${result.error || 'Generácia zlyhala'}</div>`;
        }
      }

      async function githubAction(action) {
        const result = await fetch('/api/github', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, params: {} })
        }).then((r) => r.json());

        document.getElementById('githubOutput').innerHTML = result.success ? (result.data || []).map((repo) => `<div class="message"><strong>${repo.name}</strong><div>${repo.description || ''}</div></div>`).join('') : `<div class="message">${result.error || 'GitHub API zlyhala'}</div>`;
      }

      async function cfAction(action) {
        const result = await fetch('/api/cloudflare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, params: {} })
        }).then((r) => r.json());

        document.getElementById('cfOutput').innerHTML = `<pre>${JSON.stringify(result, null, 2).slice(0, 4000)}</pre>`;
      }

      async function trigger(endpoint, method) {
        const result = await fetch(endpoint, { method }).then((r) => r.json());
        alert(JSON.stringify(result));
        loadMind();
      }

      async function loadLogs() {
        const data = await fetch('/api/logs').then((r) => r.json());
        document.getElementById('logsList').innerHTML = (data.logs || []).map((log) => `<div class="message"><strong>${log.action}</strong><div>${log.details || ''}</div></div>`).join('') || '<div class="message">Žiadne logy</div>';
      }

      async function loadStatus() {
        const data = await fetch('/api/status').then((r) => r.json());
        if (document.getElementById('status-pill')) {
          document.getElementById('status-pill').textContent = data.status || 'online';
        }
      }

      document.getElementById('chatInput').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') sendChat();
      });

      loadStatus();
      loadMind();
      loadKnowledge();
      loadGoals();
      loadLogs();
    </script>
  </body>
</html>`;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const isApi = url.pathname.startsWith("/api/");

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    await initDB(env);

    if (url.pathname === "/login" && request.method === "POST") {
      try {
        const body = await request.json();
        const token = getAdminToken(env);
        if (body.password === token) {
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: {
              ...CORS_HEADERS,
              "Content-Type": "application/json",
              "Set-Cookie": `${AUTH_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,
            },
          });
        }

        return new Response(JSON.stringify({ success: false, error: "Neplatný token" }), {
          status: 401,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      } catch {
        return new Response(JSON.stringify({ success: false, error: "Neplatný formát" }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    if (!isAuthorized(request, env)) {
      if (url.pathname === "/") {
        return new Response(loginPage(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
      }

      if (url.pathname.startsWith("/api/")) {
        return new Response(JSON.stringify({ error: "Neoprávnený prístup" }), {
          status: 401,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      return new Response(loginPage(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    if (request.method === "GET" && url.pathname === "/") {
      return new Response(mainHtml(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    if (url.pathname === "/api/status" && request.method === "GET") {
      const lastRun = await getMemory(env, "last_autonomous_run");
      const totalCycles = await getMemory(env, "total_cycles");
      const knowledgeCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM knowledge").first();
      const thoughtsCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM thoughts").first();
      return Response.json({
        status: "online",
        model: DEFAULT_MODEL,
        autonomous: {
          last_run: lastRun,
          total_cycles: totalCycles || "0",
        },
        stats: {
          knowledge_entries: Number(knowledgeCount?.count || 0),
          thoughts: Number(thoughtsCount?.count || 0),
        },
      }, { headers: CORS_HEADERS });
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        const body = await request.json();
        const message = String(body.message || "").trim();
        const sessionId = String(body.session_id || "default");
        if (!message) {
          return Response.json({ error: "Prázdna správa" }, { headers: CORS_HEADERS });
        }

        await saveMessage(env, sessionId, "user", message);
        const history = await getHistory(env, sessionId, 20);
        const relevantKnowledge = await searchKnowledge(env, message);
        const systemPrompt = await getSysPrompt(env);
        const messages = [{ role: "system", content: systemPrompt }];

        if (relevantKnowledge.length > 0) {
          messages.push({
            role: "system",
            content: "Relevantné znalosti:\n" + relevantKnowledge.map((item) => `[${item.topic}] ${item.content}`).join("\n"),
          });
        }

        for (const item of history) {
          messages.push({ role: item.role, content: item.content });
        }

        const response = await callAI(env, messages, { max_tokens: 4096, temperature: 0.7 });
        if (!response) {
          return Response.json({ error: "AI nebola dostupná. Skús znova." }, { status: 503, headers: CORS_HEADERS });
        }

        await saveMessage(env, sessionId, "assistant", response);
        await addXP(env, "komunikacia", 5);
        await logAuto(env, "chat", message.slice(0, 120), "aura-trinity");

        if (message.length > 12) {
          await saveKnowledge(env, message.slice(0, 40), response.slice(0, 500), "chat", "conversation", 0.6);
        }

        return Response.json({ response }, { headers: CORS_HEADERS });
      } catch (error) {
        return Response.json({ error: error?.message || String(error) }, { status: 500, headers: CORS_HEADERS });
      }
    }

    if (url.pathname === "/api/code" && request.method === "POST") {
      try {
        const body = await request.json();
        const result = await generateCode(env, String(body.task || "").trim(), String(body.language || "javascript"));
        return Response.json(result || { error: "Generácia zlyhala." }, { headers: CORS_HEADERS });
      } catch (error) {
        return Response.json({ error: error?.message || String(error) }, { status: 500, headers: CORS_HEADERS });
      }
    }

    if (url.pathname === "/api/mind" && request.method === "GET") {
      const state = await getInnerState(env);
      const personality = await getPersonality(env);
      const skills = await getSkills(env);
      const goals = await env.DB.prepare("SELECT goal, status FROM goals ORDER BY priority DESC LIMIT 10").all();
      const thoughts = await env.DB.prepare("SELECT content FROM thoughts ORDER BY id DESC LIMIT 5").all();
      const reflections = await env.DB.prepare("SELECT reflection FROM reflections ORDER BY id DESC LIMIT 5").all();

      return Response.json({
        state,
        personality: personality || [],
        skills: skills || [],
        goals: goals.results || [],
        thoughts: thoughts.results || [],
        reflections: reflections.results || [],
      }, { headers: CORS_HEADERS });
    }

    if (url.pathname === "/api/knowledge" && request.method === "GET") {
      const result = await env.DB.prepare("SELECT * FROM knowledge ORDER BY id DESC LIMIT 50").all();
      return Response.json({ knowledge: result.results || [] }, { headers: CORS_HEADERS });
    }

    if (url.pathname === "/api/goals" && request.method === "GET") {
      const result = await env.DB.prepare("SELECT * FROM goals ORDER BY priority DESC, id DESC LIMIT 30").all();
      return Response.json({ goals: result.results || [] }, { headers: CORS_HEADERS });
    }

    if (url.pathname === "/api/thoughts" && request.method === "GET") {
      const result = await env.DB.prepare("SELECT * FROM thoughts ORDER BY id DESC LIMIT 30").all();
      return Response.json({ thoughts: result.results || [] }, { headers: CORS_HEADERS });
    }

    if (url.pathname === "/api/evolution" && request.method === "GET") {
      const result = await env.DB.prepare("SELECT * FROM evolution_history ORDER BY id DESC LIMIT 20").all();
      return Response.json({ evolution: result.results || [] }, { headers: CORS_HEADERS });
    }

    if (url.pathname === "/api/reflect" && request.method === "POST") {
      const result = await selfReflect(env);
      return Response.json(result || { status: "ok" }, { headers: CORS_HEADERS });
    }

    if (url.pathname === "/api/think" && request.method === "POST") {
      const thought = await generateThought(env);
      return Response.json({ thought }, { headers: CORS_HEADERS });
    }

    if (url.pathname === "/api/github" && request.method === "POST") {
      const body = await request.json();
      const result = await githubAction(env, body.action, body.params || {});
      return Response.json(result, { headers: CORS_HEADERS });
    }

    if (url.pathname === "/api/cloudflare" && request.method === "POST") {
      const body = await request.json();
      const result = await cloudflareAction(env, body.action, body.params || {});
      return Response.json(result, { headers: CORS_HEADERS });
    }

    if (url.pathname === "/api/logs" && request.method === "GET") {
      const result = await env.DB.prepare("SELECT * FROM autonomous_log ORDER BY id DESC LIMIT 50").all();
      return Response.json({ logs: result.results || [] }, { headers: CORS_HEADERS });
    }

    return new Response("Not found", { status: 404, headers: CORS_HEADERS });
  },

  async scheduled(controller, env, ctx) {
    await autoCycle(env);
  },
};
