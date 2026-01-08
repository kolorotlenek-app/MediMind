
import { createClient } from "@supabase/supabase-js";

// Using credentials provided in the request
const supabaseUrl = "https://alussfddzsnhwltlsxqf.supabase.co";
const supabaseKey = "sb_publishable_cGt076peYbRILDbsF45oZw_9RNsXjJL";

export const supabase = createClient(supabaseUrl, supabaseKey);
