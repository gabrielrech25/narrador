'use strict';

module.exports = {
  PORT:        parseInt(process.env.PORT)        || 3000,
  GROQ_KEY:    process.env.GROQ_API_KEY          || '',
  GROQ_MODEL:  process.env.GROQ_MODEL            || 'llama-3.1-8b-instant',
  OL_HOST:     process.env.OLLAMA_HOST           || 'localhost',
  OL_PORT:     parseInt(process.env.OLLAMA_PORT) || 11434,
  OL_MODEL:    process.env.OLLAMA_MODEL          || 'llama3.2',

  PATHS: {
    data:      require('path').join(__dirname, 'storage'),
    chars:     require('path').join(__dirname, 'storage', 'characters'),
    camps:     require('path').join(__dirname, 'storage', 'campaigns'),
    views:     require('path').join(__dirname, 'views'),
    public:    require('path').join(__dirname, 'public'),
  },
};
// (db path already covered by PATHS.data)
