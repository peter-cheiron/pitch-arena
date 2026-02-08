import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'kpi'
})
export class KPIFormatterPipe implements PipeTransform {

  transform(value: number, ...args: unknown[]): string {
    var formattedNumber = "";
    if(value > 1000000){
      formattedNumber = Math.round(value/ 1000000) + "M";
    }else if(value > 1000){
      formattedNumber = Math.round(value/ 1000) + "K";
    }
    else{
      formattedNumber = "" + Math.round(value);
    }
    return formattedNumber;
  }

}
