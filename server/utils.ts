import { format, startOfMonth, addMonths, isBefore, isSameMonth } from "date-fns";

export function generateMonthList(startMonthStr: string) {
  const months: string[] = [];
  let current = startOfMonth(new Date(startMonthStr + "-01"));
  const end = startOfMonth(new Date()); // Current month

  // Loop from start month until we reach the current month
  while (isBefore(current, end) || isSameMonth(current, end)) {
    months.push(format(current, "yyyy-MM"));
    current = addMonths(current, 1);
  }
  return months;
}