import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DbFeedbackService } from '#services/db/db-feedback.service';
import { UiTextAreaComponent } from "../../ui/ui-textarea/ui-textarea.component";
import { UiButtonPillComponent } from "../../ui/ui-button-pill/ui-button-pill.component";
import { UiInputComponent } from '#ui';
import { Dialog } from '@angular/cdk/dialog';
import { SimpleDialogComponent } from 'src/app/ui/simple-dialog/simple-dialog.component';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';




@Component({
  standalone: true,
    selector: 'contact-us',
    templateUrl: './contact-us.component.html',
    imports: [
      TranslatePipe,
      UiTextAreaComponent, 
      UiButtonPillComponent, FormsModule, UiInputComponent]
})
export class ContactUsComponent {

  name: string;
  about : string = "general";
  aboutText : string;
  email : string;
  message : string = "";
  errorMessage : string = ""
  thanksDialog = false;
  private feedbackService = inject(DbFeedbackService)
  dialog = inject(Dialog)

  messageMap = {
    "demo-access": "I would like demo access please because: ",
    "beta": "Please put me on the beta tester waiting list." 
  }

  constructor(private router : Router,
    private route: ActivatedRoute,
    private translate: TranslateService) {}

  ngOnInit() {
    setTimeout(() => window.scrollTo(0,0), 100);//aparently this works on mobile ... 
    const subject = this.route.snapshot.queryParamMap.get('subject');
    if (subject) {
      this.message = this.messageMap[subject];
    }
  }

  sendMessage(){
  
    this.errorMessage = "";

    var message = { 
      name :this.name, 
      about: this.about, 
      email: this.email, 
      message: this.message
    }

    console.error("add in the message dialog")

    if(this.validateMessage(message)){
      this.feedbackService.createAnonymous(message).then(response => {
        const ref = this.dialog.open<boolean>(SimpleDialogComponent, {
          data: { title: this.translate.instant('contact_form.modal_thanks_header'),
            message: this.translate.instant('contact_form.modal_thanks_footer') },
          // panelClass: 'p-0 bg-transparent shadow-none', // optional
        });
        ref.closed.subscribe(obs => {
            console.log("promise deprecated", obs)
        })
      })
    }else{
      this.errorMessage = this.translate.instant('contact_form.validation_error')
    }
  }

  validateMessage(message) {
    // Check if all fields are filled
    if (!message.name || !message.about || !message.email || !message.message) {
      return false;
    }
  
    // Check if the email is valid
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    if (!emailRegex.test(message.email)) {
      return false;
    }
  
    // If all validations pass
    return true;
  }
  


  /**
   * TODO use the type as its differnt from SAVE to UPDATE
   * TODO block users from changing the seats or price.
   * @param type 
   */
  openModal(): void {
    this.thanksDialog = true;
  }

  close(){
    //TODO if we use this approach it doesn't navigate :-(
    this.thanksDialog = false;
    this.router.navigateByUrl("/about")
  }

}
