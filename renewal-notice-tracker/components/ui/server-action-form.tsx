import * as React from "react";

type ServerActionFormProps = React.FormHTMLAttributes<HTMLFormElement> & {
  serverAction?: ((formData: FormData) => unknown | Promise<unknown>) | undefined;
};

export function ServerActionForm({
  serverAction,
  children,
  ...props
}: ServerActionFormProps) {
  const shouldAttachAction =
    typeof serverAction === "function" &&
    process.env.NODE_ENV !== "test" &&
    typeof window === "undefined";
  const actionProp = shouldAttachAction
    ? ({ action: serverAction as (formData: FormData) => void | Promise<void> } as const)
    : undefined;

  return (
    <form {...props} {...actionProp}>
      {children}
    </form>
  );
}
