import { Directive, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { CardFlightService } from '../services/card-flight.service';

@Directive({
  selector: '[appCardAnchor]',
  standalone: true
})
export class CardAnchorDirective implements OnChanges, OnDestroy {
  @Input('appCardAnchor') anchorKey: string = '';
  private currentKey: string = '';

  constructor(
    private el: ElementRef<HTMLElement>,
    private flightService: CardFlightService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['anchorKey']) {
      if (this.currentKey) {
        this.flightService.unregisterAnchor(this.currentKey, this.el.nativeElement);
      }
      this.currentKey = this.anchorKey;
      if (this.currentKey) {
        this.flightService.registerAnchor(this.currentKey, this.el.nativeElement);
      }
    }
  }

  ngOnDestroy(): void {
    if (this.currentKey) {
      this.flightService.unregisterAnchor(this.currentKey, this.el.nativeElement);
    }
  }
}
