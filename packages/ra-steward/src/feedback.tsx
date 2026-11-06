import { Alert, Button } from "@mui/material";

export const QueryError = ({ error, retry }: { error: unknown; retry: () => unknown }) => (
  <Alert severity="error" action={<Button color="inherit" onClick={() => void retry()}>Retry</Button>}>
    {error instanceof Error ? error.message : String(error)}
  </Alert>
);
