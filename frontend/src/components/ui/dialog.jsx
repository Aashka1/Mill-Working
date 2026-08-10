import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props} />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef(({ className, children, ...props }, ref) => {
  // The title and the buttons stay put while only the form between them
  // scrolls. Making the whole box scroll instead carried the save button off
  // the top, and a sticky footer cannot help here: every child of a grid sits
  // in a row its own height, leaving sticky nothing to move within.
  const parts = React.Children.toArray(children)
  const header = parts.filter((c) => c.type === DialogHeader)
  const footer = parts.filter((c) => c.type === DialogFooter)
  const body = parts.filter((c) => c.type !== DialogHeader && c.type !== DialogFooter)

  return (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // A dialog taller than the screen used to run off both ends of it with
        // nothing to scroll: the box is fixed and centred, so the page behind
        // it cannot move and the buttons at the bottom were simply out of
        // reach. Adding a product line to a sale hit this first.
        "fixed left-[50%] top-[50%] z-50 flex max-h-[90dvh] w-full max-w-lg translate-x-[-50%] translate-y-[-50%] flex-col gap-4 overscroll-contain border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className
      )}
      {...props}>
      {header}
      {/* min-h-0 or the form refuses to shrink and pushes the buttons off the
          bottom of the box again. No negative margins here: they would assume
          the padding this dialog happens to carry, and a dialog that sets its
          own would spill sideways. */}
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
      {footer}
      <DialogPrimitive.Close
        className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}) => (
  <div
    className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
    {...props} />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}) => (
  <div
    // Sits below the scrolling form rather than inside it, so it stays put
    // however long the form gets.
    className={cn(
      "flex shrink-0 flex-col-reverse border-t border-border/60 -mx-6 -mb-6 px-6 pb-6 pt-4 sm:flex-row sm:justify-end sm:space-x-2",
      className)}
    {...props} />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props} />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props} />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
