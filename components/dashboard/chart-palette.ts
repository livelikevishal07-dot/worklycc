/**
 * Series colours for the dashboard charts.
 *
 * Lives in its own module because both the chart bundle and the (chart-free)
 * department list need it. Importing it from the chart module would drag
 * recharts back into the main bundle and undo the code split.
 */
export const COLORS = {
  brand:   '#6F5CFF',
  violet:  '#6F5CFF',
  sky:     '#27C0DE',
  coral:   '#F47A6F',
  emerald: '#22C58B',
  amber:   '#F2B544',
  indigo:  '#5B7BFF',
}
