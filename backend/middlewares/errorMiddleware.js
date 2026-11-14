export const notFound = (req, res) => {
    res.status(404).json({ message: 'Not found' });
};

// Express recognises error handlers by their 4 arguments, so `next` must stay.
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
    let status = err.status || err.statusCode || (res.statusCode >= 400 ? res.statusCode : 500);
    let message = err.message || 'Server error';

    if (err.name === 'CastError' || err.name === 'ValidationError') {
        status = 400;
        message = 'Invalid data';
    }
    if (err.code === 11000) {
        status = 409;
        message = 'Already exists';
    }
    if (err.type === 'entity.too.large') {
        status = 413;
        message = 'Request too large';
    }
    if (err.name === 'MulterError') {
        status = 400;
        message = err.code === 'LIMIT_FILE_SIZE' ? 'Photo must be under 3 MB' : 'Invalid upload';
    }
    if (status >= 500) {
        console.error(err);
        // Never leak internals to the client in production.
        if (process.env.NODE_ENV === 'production') message = 'Server error';
    }
    res.status(status).json({ message });
};
