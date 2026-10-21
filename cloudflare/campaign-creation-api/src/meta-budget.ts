// Supported Meta currencies use two decimal places. Compare exact minor units;
// malformed provider floors fail closed instead of being rounded into eligibility.
export function metaBudgetMeetsMinimum(budget:string,minimum:string):boolean {
  const minorUnits=(value:string):number|null=>{
    if(!/^\d{1,6}(\.\d{1,2})?$/.test(value))return null;
    const [whole,fraction='']=value.split('.');
    const units=Number(whole)*100+Number(fraction.padEnd(2,'0'));
    return Number.isSafeInteger(units)&&units>0?units:null;
  };
  const requested=minorUnits(budget),floor=minorUnits(minimum);
  return requested!==null&&floor!==null&&requested<=10_000&&requested>=floor;
}
