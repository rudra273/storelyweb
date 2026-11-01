/** The browser's own check, said the same way as our other messages ("Amount is required.").
 * Browsers word these differently and some ("Please match the requested format") say nothing useful. */
export function validityText(el: HTMLInputElement, label: string): string {
  const v = el.validity
  const name = label.replace(/\s*\(.*\)$/, '')
  if (v.valueMissing) return `${name} is required.`
  if (v.badInput) return `${name} must be a number, like 25 or 25.5.`
  if (v.typeMismatch) return el.type === 'email' ? 'Enter an email like name@example.com.' : `${name} is not in the right format.`
  if (v.rangeUnderflow) return Number(el.min) === 0 ? `${name} cannot be negative.` : `${name} must be ${el.min} or more.`
  if (v.rangeOverflow) return `${name} must be ${el.max} or less.`
  if (v.stepMismatch) {
    const places = (el.step.split('.')[1] ?? '').length
    return places ? `${name} can have at most ${places} ${places === 1 ? 'digit' : 'digits'} after the decimal point.` : `${name} must be a whole number.`
  }
  if (v.tooShort) return `${name} must be at least ${el.minLength} characters long.`
  if (v.tooLong) return `${name} can be at most ${el.maxLength} characters long.`
  if (v.patternMismatch) return `${name} is not in the right format.${el.placeholder ? ` For example: ${el.placeholder}` : ''}`
  return el.validationMessage
}
