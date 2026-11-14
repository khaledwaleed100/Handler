/** Creates an Error carrying an HTTP status, picked up by errorMiddleware. */
export const httpError = (status, message) => {
    const err = new Error(message);
    err.status = status;
    return err;
};
