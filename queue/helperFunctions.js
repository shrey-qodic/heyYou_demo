const getMilisecondsFromMinutes = (minutesToGet = 5) =>
  minutesToGet * 60 * 1000;

const TENMINUTES = 10 * 60 * 1000; // 10 minutes in milliseconds
const FIVEMINUTES = getMilisecondsFromMinutes(5);
const TWENTY_MINUTES = getMilisecondsFromMinutes(20);

export function determineTimeSettings(userCount) {
  let minAutoLikeStartTime, minDelay, maxDelay;

  if (userCount <= 5) {
    minAutoLikeStartTime = TENMINUTES;
    minDelay = FIVEMINUTES;
    maxDelay = TENMINUTES;
  } else {
    minAutoLikeStartTime = TWENTY_MINUTES;
    minDelay = TENMINUTES;
    maxDelay = TWENTY_MINUTES;
  }

  return { minAutoLikeStartTime, minDelay, maxDelay };
}

export function getRandomInterval(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
