export function validateMonth(month: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return false;
  }
  const [yearStr, monthStr] = month.split("-");
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);
  if (isNaN(year) || isNaN(monthNum)) {
    return false;
  }
  if (monthNum < 1 || monthNum > 12) {
    return false;
  }
  return true;
}

export function getDaysInMonth(year: number, month: number): number {
  // month is 1-12
  if (month === 2) {
    // February - check leap year
    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    return isLeapYear ? 29 : 28;
  }
  // April, June, September, November have 30 days
  if ([4, 6, 9, 11].includes(month)) {
    return 30;
  }
  // January, March, May, July, August, October, December have 31 days
  return 31;
}

export function monthToDateRange(month: string): { start: string; end: string } {
  const [yearStr, monthStr] = month.split("-");
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);
  
  const start = `${year}-${monthNum.toString().padStart(2, "0")}-01`;
  const daysInMonth = getDaysInMonth(year, monthNum);
  const end = `${year}-${monthNum.toString().padStart(2, "0")}-${daysInMonth.toString().padStart(2, "0")}`;
  
  return { start, end };
}

export function prevMonth(month: string): string {
  const [yearStr, monthStr] = month.split("-");
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);
  
  let prevYear = year;
  let prevMonthNum = monthNum - 1;
  if (prevMonthNum === 0) {
    prevMonthNum = 12;
    prevYear = year - 1;
  }
  return `${prevYear}-${prevMonthNum.toString().padStart(2, "0")}`;
}