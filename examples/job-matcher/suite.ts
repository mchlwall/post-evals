import path from 'node:path';
import { createJobMatcherSuite } from './jobMatcher';

/**
 * The golden set (persona, rubric, schema, labelled reports and job posts) lives in a private
 * role-match checkout and is read at run time, never copied here. Point ROLE_MATCH_DIR at it;
 * the default is a sibling directory named role-match.
 */
const dir = process.env.ROLE_MATCH_DIR ?? path.resolve(__dirname, '../../../role-match');

export default createJobMatcherSuite(dir);
