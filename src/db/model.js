import { supabase } from "./supabase.js";


export async function findOrCreateUser(telegramId, name) {
  const { data: existing } = await supabase
    .from("users")
    .select("*")
    .eq("telegram_id", telegramId)
    .single();

  if (existing) return existing;

  // create user
  const { data, error } = await supabase
    .from("users")
    .insert({
      telegram_id: telegramId,
      name: name,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getAllUsers() {
  const { data, error } = await supabase.from("users").select("*");
  if (error) throw error;
  return data;
}


export async function createEvent(title, eventDate) {
  const { data, error } = await supabase
    .from("events")
    .insert({ title, event_date: eventDate })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getLatestEvent() {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function getEventById(id) {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

//
// ✅ CONFIRMATION FUNCTIONS
//
export async function createConfirmation(userId, eventId) {
  const { data, error } = await supabase
    .from("confirmations")
    .insert({
      user_id: userId,
      event_id: eventId,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getUserConfirmation(userId, eventId) {
  const { data, error } = await supabase
    .from("confirmations")
    .select("*")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function getEventConfirmations(eventId) {
  const { data, error } = await supabase
    .from("confirmations")
    .select(
      `
      *,
      users (
        name,
        telegram_id
      )
    `
    )
    .eq("event_id", eventId);

  if (error) throw error;
  return data;
}

export async function getConfirmationCount(eventId) {
  const { count, error } = await supabase
    .from("confirmations")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId);

  if (error) throw error;
  return count;
}