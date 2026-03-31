

export const PROPOSAL_INTRO_RESPONSES = [
  '🎯 *ATTENTION EVERYONE* 🎯\n\n{name} has spoken! "{activity}"',
  `👀 *SOMEONE'S PLANNING SOMETHING* 👀\n\n@{username} says "{activity}"!`,
  `📢 *ANNOUNCEMENT* 📢\n\nThe great "{activity}" has been proposed by {name}!`,
  '✨ *PLANS INCOMING* ✨\n\n{name} is making moves with "{activity}" idea!',
  `🎪 *CIRCUS IS IN TOWN* 🎪\n\n{name} is organizing a "{activity}"! Everyone gather round!`,
  `🔥 *HOT OFF THE PRESS* 🔥\n\n{name} just proposed: "{activity}"!`,
  `💫 *MISSION ASSEMBLE* 💫\n\n{name} wants everyone for "{activity}"!`,
  `🎯 *PLAN ACTIVATED* 🎯\n\n{name} initiated: "{activity}". Who's with them?`,
  `🌟 *OPPORTUNITY KNOCKS* 🌟\n\n{name} is setting up a "{activity}". Don't miss out!`
];

// Confirmation Vibe Responses (when someone says yes)
export const CONFIRMATION_RESPONSES = [
  "WUHUUU LET'S GOOO @{username}! 🚀🎉",
  "YASSS @{username}! That's the energy we need! 🔥",
  "@{username} is IN! Party level: 📈📈📈",
  "Epic gamer moment @{username} confirmed! 🎮✨",
  "@{username} bringing the vibes! Let's gooo! 🕺💃",
  "*confetti cannon* 🎉 @{username} joins the party!",
  "@{username} knows what's up! This party is getting lit! 🔥",
  "The squad grows! @{username} confirmed! 🎊",
  "@{username} said YES! The party just got better! 🎉",
  "LET'S FRICKIN GOOO @{username}! 🚀🚀🚀",
  "@{username} is the REAL MVP! 🏆",
  "YESSS! @{username} knows how to party! 🎊",
  "Another one! @{username} joins the fun! 🔥",
  "@{username} just made the right choice! 🎯"
];

// Everyone Confirmed Celebration 
export const EVERYONE_CONFIRMED_RESPONSES = [
  "🚨 *EVERYONE IS CONFIRMED!* 🚨 @{username} completes the squad! This is going to be EPIC! 🎉",
  "🎊 *FULL HOUSE!* 🎊 Everyone's coming! @{username} made it a perfect attendance! 🔥",
  "💯 *100% CONFIRMATION RATE!* 💯 The whole squad is in! @{username} you're amazing! 🎉",
  "🌟 *PERFECT ATTENDANCE!* 🌟 Nobody's missing out! @{username} completes the crew! 🚀",
  "🎯 *MISSION ACCOMPLISHED!* 🎯 Everyone confirmed! @{username} you're the final piece! 🎊"
];

// when someone confirms twice
export const DOUBLE_CONFIRMATION_RESPONSES = [
  "🔥 DOUBLE CONFIRMED! @{username} is HYPED! 🔥",
  "@{username} is so ready they confirmed twice! That's dedication! 💪",
  "*hyperventilates in excitement* @{username} is READY! 🎉",
  "@{username} said 'I'm so in, I'll confirm twice!' Love the energy! 🚀",
  "Someone check on @{username}, they're too excited! 🔥🔥🔥",
  "We get it @{username}, you're excited! WE ALL ARE! 🎉"
];

// Excuse Blocking Responses 
export const EXCUSE_BLOCK_RESPONSES = [
  "Nice excuse @{username}, but we've seen better! 😏",
  "*prints this excuse, frames it, hangs on wall* 'Art' - @{username} 📝",
  "The excuse committee has reviewed your submission and... DENIED! 🚫",
  "Your excuse has been logged in the *Hall of Weak Excuses* 🏆 @{username}",
  "We'll add this to your permanent record @{username} 📋",
  "*pretends to be convinced* ...Nope, not buying it! 😏 @{username}",
  "This excuse gets a 2/10 - not creative enough @{username}!",
  "Your excuse is under investigation by the Fun Police 🚔 @{username}",
  "I've seen better excuses from a goldfish @{username} 🐠",
  "Excuse rejected! Please try again with more creativity @{username} 🎭",
  "@{username} said NO but their heart said YES! Don't lie! 💔",
  "The group has voted... Your excuse is INVALID! 🗳️ @{username}"
];

// Already Confirmed Trying to Excuse
export const ALREADY_CONFIRMED_EXCUSE_RESPONSES = [
  "🤔 Nice try *{name}*, but you're already locked in for *{event}*!\n\nNo take backs! The party needs you! 🎉",
  "Nice try {name}! You're already on the list! No escape now! 🔒",
  "Too late {name}! Your name is already in permanent marker! ✍️",
  "{name} trying to bail? The contract is signed in blood! Just kidding... but seriously, you're coming! 😈"
];

// Hype Responses for neutral engagement
export const HYPE_RESPONSES = [
  "👀 Interesting... {name} has thoughts!",
  "🤔 Hmm, tell me more {name}!",
  "😄 Living for this conversation!",
  "💭 *takes notes* Go on {name}...",
  "🎭 The plot thickens!",
  "📝 *furiously taking notes*",
  "👂 Spill the tea {name}!",
  "🎯 This conversation is getting good!"
];

// Proposal Detection Responses
export const PROPOSAL_DETECT_RESPONSES = [
  "👀 {userName} has an idea! What do others think? 🎯",
  "🤔 {userName} is cooking something up! Spill the details! 🍳",
  "🎯 Ooh {userName} has a plan! I'm listening... 👂",
  "🌟 {userName} is thinking! Let's hear everyone else! 🗣️"
];

// Reminder Messages
export const REMINDER_CONFIRMED_RESPONSES = [
  "🎉 @{username}! Get ready for {event} {daysUntil}! 🎉\n\n{count} people are joining you! This is going to be LIT! 🔥",
  "🚀 @{username}, the hype is REAL! {event} is {daysUntil} and {count} legends are confirmed! 🚀",
  "✨ @{username}, your presence has been requested! {event} {daysUntil}. {count} others are waiting for you! ✨",
  "💪 @{username}, you're confirmed for {event}! {pendingCount} more to join and we're complete! Let's go! 🎊"
];

export const REMINDER_UNCONFIRMED_RESPONSES = [
  "👀 @{username}... {count} people are coming to {event} {daysUntil}.\n\n*You're missing out!* 😏\n\nStill time to join! 🎉",
  "😱 @{username}! {count} people confirmed for {event} and you're NOT one of them?\n\n*FOMO is real!* Join now! 🚀",
  "🔔 @{username}, this is your friendly reminder that {event} is {daysUntil}.\n\n{count} people said yes. What about you? 🤔",
  "🎯 *CHALLENGE* 🎯\n\n@{username}, be the {nextNumber}th person to confirm for {event}! Don't let FOMO win! 💪",
  "👋 Hey @{username}! {event} {daysUntil}!\n\n{count} amazing people are going.\n\n*Join the party!* 🎊"
];


export const EVENT_CANCELLED_RESPONSES = [
  `🚨 *EVENT CANCELLED!* 🚨\n\n"{event}" has been called off by {name}.\n\nSee you next time everyone! 👋`,
  `❌ *PLANS CHANGED!* ❌\n\n"{event}" is no longer happening.\n\n{name} pulled the plug! Better luck next time! 😅`,
  `📢 *UPDATE* 📢\n\n"{event}" has been cancelled by {name}.\n\nBack to the planning board! 🎯`,
  `💔 *HEARTBREAKING NEWS* 💔\n\n"{event}" is cancelled!\n\n{name} owes everyone an explanation! 😏`,
  `🎭 *PLOT TWIST* 🎭\n\n"{event}" has been cancelled by {name}.\n\nWho's organizing the next one? 👀`,
  `⏰ *POSTPONED* ⏰\n\n"{event}" is cancelled for now.\n\n{name}, you owe us a reschedule! 📅`,
  `😢 *SAD DAY* 😢\n\n"{event}" has been cancelled.\n\n{name}, we'll remember this! 📝`
];

export const NO_ACTIVE_EVENT_RESPONSES = [
  `❌ No active event to cancel! Create one with /event or say 'let's ...' 🎯`,
  `🤔 There's no event happening right now. Start one by proposing an activity!`,
  `📭 Nothing to cancel! Why not organize something new? 🎉`,
  `💭 No active event found. Be the hero and create one! 🦸`
];


//  function to get random response
export function getRandomResponse(responseArray, replacements = {}) {
  let response = responseArray[Math.floor(Math.random() * responseArray.length)];
  
  // Replace placeholders
  for (const [key, value] of Object.entries(replacements)) {
    response = response.replace(new RegExp(`{${key}}`, 'g'), value);
  }
  
  return response;
}