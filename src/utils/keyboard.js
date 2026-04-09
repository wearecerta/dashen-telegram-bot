import { Markup } from "telegraf";

function formatEventId(eventId) {
  return String(eventId).replace(/_/g, '');
}

// Main action buttons - Status and Cancel Event 
export function getEventActionKeyboard(eventId, isConfirmed = false) {
  const id = formatEventId(eventId);
  
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("📊 View Status", `status_${id}`),
      Markup.button.callback("🚫 Cancel Event", `cancel_event_${id}`)
    ]
  ]);
}

// Status and Cancel Event
export function getAfterCreationKeyboard(eventId) {
  const id = formatEventId(eventId);
  
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("📊 View Status", `status_${id}`),
      Markup.button.callback("🚫 Cancel Event", `cancel_event_${id}`)
    ]
  ]);
}

// Status keyboard - Refresh and Cancel
export function getStatusKeyboard(eventId) {
  const id = formatEventId(eventId);
  
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("🔄 Refresh Status", `status_${id}`),
      Markup.button.callback("🚫 Cancel Event", `cancel_event_${id}`)
    ]
  ]);
}

// Post confirmation - Status and Cancel
export function getPostConfirmationKeyboard(eventId) {
  const id = formatEventId(eventId);
  
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("📊 View Status", `status_${id}`),
      Markup.button.callback("🚫 Cancel Event", `cancel_event_${id}`)
    ]
  ]);
}

// Post excuse - Status and Cancel
export function getPostExcuseKeyboard(eventId) {
  const id = formatEventId(eventId);
  
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("📊 View Status", `status_${id}`),
      Markup.button.callback("🚫 Cancel Event", `cancel_event_${id}`)
    ]
  ]);
}

// Reschedule poll keyboard
export function getReschedulePollKeyboard(eventId, newDate) {
  // Use raw eventId, not formatted, fits within 64 bytes
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("👍 Yes, change it", `vote_r_y_${eventId}_${newDate}`),
      Markup.button.callback("👎 No", `vote_r_n_${eventId}_${newDate}`)
    ]
  ]);
}