import { supabase } from "./supabase.js";


export async function findOrCreateUser(telegramId, name, chatId) {
  const { data: existing } = await supabase
    .from("users")
    .select("*")
    .eq("telegram_id", telegramId)
    .eq("chat_id", chatId)
    .single();

  if (existing) return existing;

  // Create user for this specific chat
  const { data, error } = await supabase
    .from("users")
    .insert({
      telegram_id: telegramId,
      name: name,
      chat_id: chatId,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getAllUsers(chatId) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("chat_id", chatId);
  
  if (error) throw error;
  return data;
}


export async function createEvent(title, eventDate, chatId) {
  const { data, error } = await supabase
    .from("events")
    .insert({ 
      title, 
      event_date: eventDate,
      chat_id: chatId 
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getLatestEvent(chatId) {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("chat_id", chatId)
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
        id,
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

export async function deleteConfirmation(userId, eventId) {
  const { error } = await supabase
    .from("confirmations")
    .delete()
    .eq("user_id", userId)
    .eq("event_id", eventId);

  if (error) throw error;
  return true;
}

export async function deleteEvent(eventId) {
  // First delete all confirmations for this event
  await supabase
    .from("confirmations")
    .delete()
    .eq("event_id", eventId);
  
  // Then delete the event
  const { error } = await supabase
    .from("events")
    .delete()
    .eq("id", eventId);
  
  if (error) throw error;
  return true;
}