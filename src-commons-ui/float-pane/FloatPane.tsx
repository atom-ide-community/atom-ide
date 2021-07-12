import { DisplayMarker, Decoration, TextEditor, Disposable, DisposableLike, CompositeDisposable, TextEditorElement } from "atom"
import "../../types-packages/atom"
import { Observable, fromEvent } from "rxjs"
import type {Subscription} from "rxjs"
import { disposableFromSubscription } from "../../src-commons-atom/disposable"
import { PinnedDatatipPosition, Datatip } from "../../types-packages/main"

import * as React from "react"
import ReactDOM from "react-dom"
import invariant from "assert"
import classnames from "classnames"

import { ViewContainer, DATATIP_ACTIONS } from "./ViewContainer"
import isScrollable from "./isScrollable"

const LINE_END_MARGIN = 20

let _mouseMove$: Observable<MouseEvent>
function documentMouseMove$(): Observable<MouseEvent> {
  if (_mouseMove$ == null) {
    _mouseMove$ = fromEvent<MouseEvent>(document, "mousemove")
  }
  return _mouseMove$
}

let _mouseUp$: Observable<MouseEvent>
function documentMouseUp$(): Observable<MouseEvent> {
  if (_mouseUp$ == null) {
    _mouseUp$ = fromEvent<MouseEvent>(document, "mouseup")
  }
  return _mouseUp$
}

interface Position {
  x: number,
  y: number,
}
export interface PinnedDatatipParams {
  onDispose: (pinnedDatatip: PinnedDatatip) => void,
  hideDataTips: () => void,
  // Defaults to 'end-of-line'.
  position?: PinnedDatatipPosition,
  // Defaults to true.
  showRangeHighlight?: boolean,
}

export class PinnedDatatip {
  _boundDispose: Function
  _boundHandleMouseDown: Function
  _boundHandleCapturedClick: Function
  _mouseUpTimeout: NodeJS.Timeout | null = null
  _hostElement: HTMLElement = document.createElement("div")
  _marker?: DisplayMarker
  _rangeDecoration?: Decoration
  _mouseSubscription: Subscription | null = null
  _subscriptions: CompositeDisposable = new CompositeDisposable()
  _datatip: Datatip
  _editor: TextEditor
  _dragOrigin: Position | null = null
  _isDragging: boolean = false
  _offset: Position =  { x: 0, y: 0 }
  _isHovering: boolean = false
  _checkedScrollable: boolean = false
  _isScrollable: boolean = false
  _hideDataTips: () => void
  _position: PinnedDatatipPosition
  _showRangeHighlight: boolean

  constructor(datatip: Datatip, editor: TextEditor, params: PinnedDatatipParams) {
    this._subscriptions.add(new Disposable(() => params.onDispose(this)))
    this._datatip = datatip
    this._editor = editor
    this._hostElement.className = "datatip-element"
    this._boundDispose = this.dispose.bind(this)
    this._boundHandleMouseDown = this.handleMouseDown.bind(this)
    this._boundHandleCapturedClick = this.handleCapturedClick.bind(this)

    const _wheelSubscription = fromEvent<WheelEvent>(this._hostElement, "wheel").subscribe((e) => {
      if (!this._checkedScrollable) {
        this._isScrollable = isScrollable(this._hostElement, e)
        this._checkedScrollable = true
      }
      if (this._isScrollable) {
        e.stopPropagation()
      }
    })

    this._subscriptions.add(
      disposableFromSubscription(_wheelSubscription)
    )
    this._hostElement.addEventListener("mouseenter", (e) => this.handleMouseEnter(e))
    this._hostElement.addEventListener("mouseleave", (e) => this.handleMouseLeave(e))
    this._subscriptions.add(
      new Disposable(() => {
        this._hostElement.removeEventListener("mouseenter", (e) => this.handleMouseEnter(e))
        this._hostElement.removeEventListener("mouseleave", (e) => this.handleMouseLeave(e))
      })
    )
    this._hideDataTips = params.hideDataTips
    this._position = params.position == null ? "end-of-line" : params.position
    this._showRangeHighlight = params.showRangeHighlight == null ? true : params.showRangeHighlight
    this.render()
  }

  // Mouse event hanlders:

  handleMouseEnter(event: MouseEvent): void {
    this._isHovering = true
    this._hideDataTips()
  }

  handleMouseLeave(event: MouseEvent): void {
    this._isHovering = false
  }

  isHovering(): boolean {
    return this._isHovering
  }

  handleGlobalMouseMove(evt: MouseEvent): void {
    const { _dragOrigin } = this
    invariant(_dragOrigin)
    this._isDragging = true
    this._offset = {
      x: evt.clientX - _dragOrigin.x,
      y: evt.clientY - _dragOrigin.y,
    }
    this.render()
  }

  handleGlobalMouseUp(): void {
    // If the datatip was moved, push the effects of mouseUp to the next tick,
    // in order to allow cancellation of captured events (e.g. clicks on child components).
    this._mouseUpTimeout = setTimeout(() => {
      this._isDragging = false
      this._dragOrigin = null
      this._mouseUpTimeout = null
      this._ensureMouseSubscriptionDisposed()
      this.render()
    }, 0)
  }

  _ensureMouseSubscriptionDisposed(): void {
    if (this._mouseSubscription != null) {
      this._mouseSubscription.unsubscribe()
      this._mouseSubscription = null
    }
  }

  handleMouseDown(evt: MouseEvent): void {
    this._dragOrigin = {
      x: evt.clientX - this._offset.x,
      y: evt.clientY - this._offset.y,
    }
    this._ensureMouseSubscriptionDisposed()
    this._mouseSubscription = documentMouseMove$()
      .takeUntil(documentMouseUp$())
      .subscribe(
        (e: MouseEvent) => {
          this.handleGlobalMouseMove(e)
        },
        (error: any) => {},
        () => {
          this.handleGlobalMouseUp()
        }
      )
  }

  handleCapturedClick(event: SyntheticEvent<>): void {
    if (this._isDragging) {
      event.stopPropagation()
    } else {
      // Have to re-check scrolling because the datatip size may have changed.
      this._checkedScrollable = false
    }
  }

  // Update the position of the pinned datatip.
  _updateHostElementPosition(): void {
    const { _editor, _datatip, _hostElement, _offset, _position } = this
    const { range } = _datatip
    _hostElement.style.display = "block"
    switch (_position) {
      case "end-of-line":
        const charWidth = _editor.getDefaultCharWidth()
        const lineLength = _editor.getBuffer().getLines()[range.start.row].length
        _hostElement.style.top = -_editor.getLineHeightInPixels() + _offset.y + "px"
        _hostElement.style.left = (lineLength - range.end.column) * charWidth + LINE_END_MARGIN + _offset.x + "px"
        break
      case "above-range":
        _hostElement.style.bottom = _editor.getLineHeightInPixels() + _hostElement.clientHeight - _offset.y + "px"
        _hostElement.style.left = _offset.x + "px"
        break
      default:
        // ;(_position: empty)
        throw new Error(`Unexpected PinnedDatatip position: ${this._position}`)
    }
  }

  async render(): Promise<void> {
    const { _editor, _datatip, _hostElement, _isDragging, _isHovering } = this

    let rangeClassname = "datatip-highlight-region"
    if (_isHovering) {
      rangeClassname += " datatip-highlight-region-active"
    }

    if (this._marker == null) {
      const marker: DisplayMarker = _editor.markBufferRange(_datatip.range, {
        invalidate: "never",
      })
      this._marker = marker
      _editor.decorateMarker(marker, {
        type: "overlay",
        position: "head",
        class: "datatip-pinned-overlay",
        item: this._hostElement,
        // above-range datatips currently assume that the overlay is below.
        avoidOverflow: this._position !== "above-range",
      })
      if (this._showRangeHighlight) {
        this._rangeDecoration = _editor.decorateMarker(marker, {
          type: "highlight",
          class: rangeClassname,
        })
      }
      await _editor.getElement().getNextUpdatePromise()
      // Guard against disposals during the await.
      if (marker.isDestroyed() || _editor.isDestroyed()) {
        return
      }
    } else if (this._rangeDecoration != null) {
      this._rangeDecoration.setProperties({
        type: "highlight",
        class: rangeClassname,
      })
    }

    ReactDOM.render(
      <ViewContainer
        action={DATATIP_ACTIONS.CLOSE}
        actionTitle="Close this datatip"
        className={classnames(_isDragging ? "datatip-dragging" : "", "datatip-pinned")}
        {..._datatip}
        onActionClick={this._boundDispose}
        onMouseDown={this._boundHandleMouseDown}
        onClickCapture={this._boundHandleCapturedClick}
      />,
      _hostElement
    )
    this._updateHostElementPosition()
  }

  dispose(): void {
    if (this._mouseUpTimeout != null) {
      clearTimeout(this._mouseUpTimeout)
    }
    if (this._marker != null) {
      this._marker.destroy()
    }
    if (this._mouseSubscription != null) {
      this._mouseSubscription.unsubscribe()
    }
    ReactDOM.unmountComponentAtNode(this._hostElement)
    this._hostElement.remove()
    this._subscriptions.dispose()
  }
}
