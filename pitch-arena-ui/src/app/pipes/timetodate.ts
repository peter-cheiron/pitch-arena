import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ 
  name: 'timetodate', 
  standalone: true
})
export class TimeToDatePipe implements PipeTransform {

  /**
   * Timestamps to dates are not well handled IMO.
   * 
   * @param timestamp normally the firebase object
   * @param args none required
   * @returns a date object for js.
   */
  transform(timestamp: any, ...args: unknown[]): Date {
    if(timestamp instanceof Date){
      return date;
    }else if (timestamp) {
      var tmp = timestamp;
      var date = new Date(tmp.seconds * 1000)
      return date;
    } else {
      return new Date();
    }
  }
}
