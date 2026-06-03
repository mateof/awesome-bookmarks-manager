import { Route, Routes } from "react-router-dom";
import { AuthProvider, RequireAuth } from "./auth.js";
import { Layout } from "./components/Layout.js";
import { BookmarkDetailPage } from "./pages/BookmarkDetailPage.js";
import { FolderPage } from "./pages/FolderPage.js";
import { GroupsPage } from "./pages/GroupsPage.js";
import { InvitePage } from "./pages/InvitePage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { SearchPage } from "./pages/SearchPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { SharedPage } from "./pages/SharedPage.js";
import { SharePage } from "./pages/SharePage.js";
import { SignupPage } from "./pages/SignupPage.js";
import { TagFilterPage } from "./pages/TagFilterPage.js";
import { TagsPage } from "./pages/TagsPage.js";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/share/:token" element={<SharePage />} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route
          path="*"
          element={
            <RequireAuth>
              <Layout>
                <Routes>
                  <Route path="/" element={<FolderPage />} />
                  <Route path="/folder/:id" element={<FolderPage />} />
                  <Route path="/bookmark/:id" element={<BookmarkDetailPage />} />
                  <Route path="/search" element={<SearchPage />} />
                  <Route path="/groups" element={<GroupsPage />} />
                  <Route path="/groups/:id" element={<GroupsPage />} />
                  <Route path="/shared" element={<SharedPage />} />
                  <Route path="/shared/:shareId" element={<SharedPage />} />
                  <Route path="/tags" element={<TagsPage />} />
                  <Route path="/tag/:id" element={<TagFilterPage />} />
                  <Route path="/settings/*" element={<SettingsPage />} />
                </Routes>
              </Layout>
            </RequireAuth>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
