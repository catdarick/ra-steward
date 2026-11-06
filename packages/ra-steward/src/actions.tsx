import { Box, Button, Dialog, DialogContent, IconButton, Toolbar as MuiToolbar, Tooltip, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Confirm, Form, Loading, useNotify, useRefresh, type RaRecord } from "react-admin";
import { useFormState } from "react-hook-form";
import { StewardError } from "./client.js";
import { targetKey, useDescribe, useOpenPage, usePageHref, usePagePlace, useSteward, wantsNewTab } from "./context.js";
import { FormInputs } from "./forms.js";
import type { ActionAnswer, ActionDesc, ActionStates, ButtonDesc, Effect, FormErrors, InitialAnswer, Width } from "./protocol.js";
import { Icon } from "./values.js";
import { QueryError } from "./feedback.js";
import { formInitialValues } from "./inputs.js";

/** Where a button stands: on the record of its page, in a row, or in a toolbar of no record. */
export type Origin = "page" | "row" | "toolbar";

/** Runs an action and what its answer says; resolves to the errors of the form when it is invalid. */
export const useRunAction = (origin: Origin) => {
  const { client } = useSteward();
  const notify = useNotify();
  const refresh = useRefresh();
  const openPage = useOpenPage();
  const place = usePagePlace();

  const runEffect = useCallback(
    async (effect: Effect) => {
      switch (effect.type) {
        case "refresh":
          refresh();
          break;
        case "open":
          openPage(effect.service, effect.page, effect.key === null || effect.key === undefined ? null : String(effect.key));
          break;
        case "link":
          window.open(effect.url, "_blank", "noopener");
          break;
        case "download":
          await client.download(effect.url, effect.filename);
          break;
        case "close":
          // Only the page of a record, from a button on its record, is closed.
          if (origin === "page" && place?.key) place.close();
          break;
      }
    },
    [client, openPage, origin, place, refresh],
  );

  return useCallback(
    async (service: string, action: string, key: string | null | undefined, payload: unknown): Promise<FormErrors | undefined> => {
      try {
        const answer = await client.request<ActionAnswer>(service, ["actions", action], { body: { key: key ?? undefined, payload: payload ?? null } });
        notify(answer.message, { type: "success" });
        for (const effect of answer.effects) await runEffect(effect);
        return undefined;
      } catch (e) {
        if (e instanceof StewardError && e.status === 422 && e.errors) return e.errors;
        notify(e instanceof Error ? e.message : String(e), { type: e instanceof StewardError && e.status === 409 ? "warning" : "error" });
        if (e instanceof StewardError && e.status === 409) refresh();
        throw e;
      }
    },
    [client, notify, refresh, runEffect],
  );
};

/** A button of an action or a link, as the server described it, in its place. */
export const ActionButton = ({
  service,
  button,
  record,
  states,
  origin,
  size = "small",
}: {
  service: string;
  button: ButtonDesc;
  record?: RaRecord;
  states?: ActionStates;
  origin: Origin;
  size?: "small" | "medium";
}) => {
  const openPage = useOpenPage();
  const hrefOf = usePageHref();
  const describe = useDescribe(service);
  const run = useRunAction(origin);
  const [confirming, setConfirming] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  if (button.kind === "link") {
    const key = targetKey(button.target, record);
    return (
      <Button
        size={size}
        color={button.color ?? "primary"}
        startIcon={<Icon name={button.icon} />}
        href={hrefOf(button.target.service, button.target.page, key)}
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          if (wantsNewTab(e)) return;
          e.preventDefault();
          openPage(button.target.service, button.target.page, key);
        }}
        onAuxClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {button.label}
      </Button>
    );
  }

  const action: ActionDesc | undefined = describe.data?.actions[button.action];
  const reason = states?.disabled[button.action];
  const allowed = states ? states.enabled.includes(button.action) || reason !== undefined : true;
  if (!action || !allowed || (reason !== undefined && button.hideDisabled)) return null;

  const key = action.record ? (record ? String(record.id) : null) : null;
  const go = async () => {
    if (action.form) return setFormOpen(true);
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await run(service, action.id, key, null);
    } catch {
      // reported by run
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  const element = (
    <Button
      size={size}
      color={button.color ?? "primary"}
      startIcon={<Icon name={button.icon} />}
      disabled={!states || reason !== undefined || busy}
      onClick={(e) => {
        e.stopPropagation();
        if (button.confirm) setConfirming(true);
        else void go();
      }}
    >
      {button.label}
    </Button>
  );

  return (
    <>
      {reason !== undefined ? (
        <Tooltip title={reason}>
          <span onClick={(e) => e.stopPropagation()}>{element}</span>
        </Tooltip>
      ) : (
        element
      )}
      {/* Dialogs are portals, but React's events bubble through them to the row: keep them here. */}
      <span onClick={(e) => e.stopPropagation()} style={{ display: "contents" }}>
      {button.confirm && (
        <Confirm
          isOpen={confirming}
          title={button.confirm.title}
          content={button.confirm.text}
          onConfirm={() => {
            setConfirming(false);
            void go();
          }}
          onClose={() => setConfirming(false)}
        />
      )}
      {formOpen && (
        <ActionForm service={service} action={action} label={button.label} recordKey={key} width={button.width} origin={origin} onClose={() => setFormOpen(false)} />
      )}
      </span>
    </>
  );
};

/** The dialog of a form: the one thing that opens over the panel, for doing, not for looking. */
export const FormDialog = ({ width, title, onClose, children }: { width: Width; title: ReactNode; onClose: () => void; children: ReactNode }) => {
  const titleId = useId();
  return (
    <Dialog
      open
      onClose={onClose}
      aria-labelledby={titleId}
      fullWidth
      maxWidth={typeof width === "number" ? false : width}
      slotProps={{ paper: { sx: typeof width === "number" ? { width, maxWidth: "100%" } : undefined } }}
    >
      <MuiToolbar disableGutters sx={{ px: 2, gap: 1 }}>
        <Typography id={titleId} component="h2" variant="h6" sx={{ flex: 1 }} noWrap>
          {title}
        </Typography>
        <IconButton aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </MuiToolbar>
      <DialogContent>{children}</DialogContent>
    </Dialog>
  );
};

/** The form of an action, with its initial values; the server's errors go next to the inputs. */
export const ActionForm = ({
  service,
  action,
  label,
  recordKey,
  width,
  origin,
  onClose,
}: {
  service: string;
  action: ActionDesc;
  label: string;
  recordKey: string | null;
  width: Width;
  origin: Origin;
  onClose: () => void;
}) => {
  const { client } = useSteward();
  const run = useRunAction(origin);
  const pending = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const initial = useQuery({
    queryKey: ["steward", "initial", service, action.id, recordKey],
    queryFn: () => client.request<InitialAnswer>(service, ["actions", action.id, "initial"], { query: { key: recordKey } }),
    gcTime: 0,
    retry: false,
  });
  const values = useMemo(() => formInitialValues(action.form ?? [], initial.data?.data ?? {}), [action.form, initial.data]);
  const close = () => { if (!pending.current) onClose(); };
  return (
    <FormDialog width={width} title={label} onClose={close}>
      {initial.error ? <QueryError error={initial.error} retry={initial.refetch} /> : initial.isPending ? <Loading /> : (
        <Form
          record={values}
          onSubmit={async (values: Record<string, unknown>) => {
            if (pending.current) return;
            pending.current = true;
            setSubmitting(true);
            try {
              const errors = await run(service, action.id, recordKey, values);
              if (!errors) onClose();
              return errors;
            } catch {
              return undefined;
            } finally {
              pending.current = false;
              setSubmitting(false);
            }
          }}
        >
          <Box sx={{ display: "flex", flexDirection: "column", pt: 1 }}>
            <FormInputs service={service} action={action} recordKey={recordKey} fields={action.form ?? []} prefix="" />
          </Box>
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, pt: 1 }}>
            <Button onClick={close} disabled={submitting}>Cancel</Button>
            <SubmitAction label={label} icon={action.icon} busy={submitting} />
          </Box>
        </Form>
      )}
    </FormDialog>
  );
};

export const SubmitAction = ({ label, icon, busy }: { label: string; icon?: string; busy: boolean }) => {
  const { isSubmitting, isValidating } = useFormState();
  return <Button type="submit" variant="contained" disabled={busy || isSubmitting || isValidating} startIcon={<Icon name={icon ?? "Check"} />}>{label}</Button>;
};
