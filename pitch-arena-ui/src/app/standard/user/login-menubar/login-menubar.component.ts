import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  standalone: true,
    selector: 'app-login-menubar',
    templateUrl: './login-menubar.component.html',
    styleUrl: './login-menubar.component.css',
    imports: [RouterLink, TranslatePipe]
})
export class LoginMenubarComponent {

}
