import * as React from "react";

type ServerActionFormProps = React.FormHTMLAttributes<HTMLFormElement> & {
  serverAction?: ((formData: FormData) => void | Promise<void>) | undefined;
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
  const actionProp = shouldAttachAction ? ({ action: serverAction } as const) : undefined;

  return (
    <form {...props} {...actionProp}>
      {children}
    </form>
  );
}
