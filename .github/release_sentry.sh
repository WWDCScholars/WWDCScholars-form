#!/bin/sh

# Add node_modules/.bin to PATH
PATH=$PATH:node_modules/.bin

# Sentry organization & project
ORG=wwdcscholars
PRJ=form

# Base URL
URL=https://join.wwdcscholars.com

# Get version (current tag)
VERSION=`git describe --tags`

# Create new version in sentry
sentry-cli releases -o $ORG -p $PRJ new --finalize $VERSION
sentry-cli releases -o $ORG -p $PRJ set-commits --auto $VERSION
sentry-cli releases -o $ORG -p $PRJ files $VERSION upload-sourcemaps --url-prefix $URL ./dist
