#!/bin/bash

# New author info
NEW_NAME="maryamshehzadi768@gmail.com"
NEW_EMAIL="maryamshehzadi768@gmail.com"

# New GitHub remote
NEW_REMOTE="https://github.com/engmaryamameen/ShopNest.git"

echo "Rewriting Git history with new author info..."

git filter-branch --env-filter "
    if [ \"\$GIT_AUTHOR_EMAIL\" = \"155364505+maryamameen34@users.noreply.github.com\" ] || [ \"\$GIT_AUTHOR_NAME\" = \"Maryam-Ameen\" ] || [ \"\$GIT_AUTHOR_NAME\" = \"maryamameen34\" ]; then
        export GIT_AUTHOR_NAME='$NEW_NAME'
        export GIT_AUTHOR_EMAIL='$NEW_EMAIL'
        export GIT_COMMITTER_NAME='$NEW_NAME'
        export GIT_COMMITTER_EMAIL='$NEW_EMAIL'
    fi
" --tag-name-filter cat -- --all

echo "Adding new remote..."
git remote remove origin 2> /dev/null
git remote add origin "$NEW_REMOTE"

echo "Pushing to new origin..."
# git push origin --force --all
# git push origin --force --tags

echo "✅ Done. Code pushed to: $NEW_REMOTE"
