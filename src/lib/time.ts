const DATE_INPUT_FORMAT = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function toDateInputValue(date = new Date()) {
  return DATE_INPUT_FORMAT.format(date);
}

export function dateInputToServiceKey(value: string) {
  return value.replace(/-/g, "");
}

export function todayServiceKey() {
  return dateInputToServiceKey(toDateInputValue());
}

export function defaultArrivalTime() {
  const date = new Date();
  date.setMinutes(date.getMinutes() + 45);
  const minutes = Math.ceil(date.getMinutes() / 5) * 5;
  date.setMinutes(minutes, 0, 0);
  return `${date.getHours()}`.padStart(2, "0") + ":" + `${date.getMinutes()}`.padStart(2, "0");
}

export function timeInputToSeconds(value: string) {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 3600 + Number(minutes) * 60;
}

export function currentServiceSeconds() {
  const now = new Date();
  return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
}

export function formatServiceTime(seconds: number) {
  const normalized = ((seconds % 86400) + 86400) % 86400;
  const hours = Math.floor(normalized / 3600);
  const minutes = Math.floor((normalized % 3600) / 60);
  return `${hours}`.padStart(2, "0") + ":" + `${minutes}`.padStart(2, "0");
}

export function formatDelay(seconds: number) {
  const minutes = Math.round(Math.abs(seconds) / 60);
  return `${minutes} min`;
}

export function epochSecondsToServiceSeconds(epochSeconds: number, serviceDateKey: string) {
  const year = Number(serviceDateKey.slice(0, 4));
  const month = Number(serviceDateKey.slice(4, 6));
  const day = Number(serviceDateKey.slice(6, 8));
  const localMidnight = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
  return Math.round((epochSeconds * 1000 - localMidnight) / 1000);
}

export function formatDataDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
