#!/bin/bash
cd backend
node db/migrate.js up
npm start
