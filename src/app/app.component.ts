import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  constructor() {}
}
