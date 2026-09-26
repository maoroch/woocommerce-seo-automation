/**
 * Locale-independent date formatting.
 *
 * `toLocaleString()` / `toLocaleDateString()` without an explicit locale use
 * the runtime's default locale — which differs between the Node SSR process
 * and the browser, causing React hydration mismatches. These helpers always
 * use a fixed locale ("en-GB") so server and client render identical text.
 */

const DATE_TIME_OPTS: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
};

const DATE_OPTS: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
};

export function formatDateTime(value: string | number | Date): string {
    return new Date(value).toLocaleString("en-GB", DATE_TIME_OPTS);
}

export function formatDate(value: string | number | Date): string {
    return new Date(value).toLocaleDateString("en-GB", DATE_OPTS);
}
