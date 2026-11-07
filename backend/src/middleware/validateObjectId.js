import mongoose from 'mongoose';

const validateObjectId = (paramName = 'id', label = paramName) => {
  return (req, res, next) => {
    const id = req.params[paramName];

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: `Invalid ${label} format`,
      });
    }

    next();
  };
};

export default validateObjectId;
